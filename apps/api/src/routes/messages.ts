import { and, asc, desc, eq, gte, inArray, like, not, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  appendBrandingFooter,
  appendComplianceFooter,
  contactVariables,
  wingBrandingRequired,
  enqueueSend,
  env,
  Errors,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  newId,
  PRIORITIES,
  render,
  SANDBOX_TEST_SENDS_PER_DAY,
  sha256Hex,
  signProof,
  TEST_RECIPIENT_DOMAIN,
  testRecipientFor,
  unsubscribeUrl,
  viewInBrowserUrl,
  canRetryMessage,
  ORG_SENDS_PER_MINUTE,
  checkAndCount,
  scanContent,
  MAX_ATTACHMENT_BYTES,
} from "@rootmail/core";
import {
  activeReplyDomain,
  assets,
  auditEntries,
  db,
  messages,
  type Message,
  type MessageAttachment,
  openConversationForSend,
  organizations,
  resolveReplyTo,
  subTenants,
  type SubTenant,
  type Workspace,
  verifiedRecipients,
  orgSendingProviders,
} from "@rootmail/db";
import { writeAudit } from "../lib/audit";
import {
  assertEmailVerified,
  assertMarketingSendCapacity,
  assertTransactionalSendCapacity,
  assertCanSend,
  recordMarketingSend,
  recordTransactionalDaily,
  recordSend,
  sendKindOf,
  tryConsumeMarketing,
  tryConsumeQuota,
} from "../lib/billing";
import { authActor } from "../lib/dispatch";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { defaultSenderFor, verifiedSenderFor } from "../lib/senders";
import { addSuppression, findContact, isSuppressed, loadTemplate } from "../lib/queries";
import { serializeAudit, serializeMessage } from "../lib/serialize";
import { parse } from "../lib/validate";

const emailAddress = z.object({ email: z.string().email(), name: z.string().optional() });

const sendBody = z.object({
  to: z.union([z.string().email(), emailAddress]),
  type: z.enum(MESSAGE_TYPES).default("transactional"),
  from: z.union([z.string().email(), emailAddress]).optional(),
  reply_to: z.string().email().optional(),
  subject: z.string().optional(),
  template: z.string().optional(),
  template_id: z.string().optional(),
  variables: z.record(z.unknown()).default({}),
  html: z.string().optional(),
  text: z.string().optional(),
  send_at: z.string().datetime().optional(),
  priority: z.enum(PRIORITIES).default("normal"),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  idempotency_key: z.string().min(1).optional(),
  sub_tenant_id: z.string().optional(),
  // File attachments — each references an uploaded asset (POST /v1/assets) by id.
  attachments: z.array(z.object({ id: z.string() })).max(10).optional(),
});

// Email attachments are constrained by inbox size caps — SES rejects over ~40MB
// and most providers strip past 25MB, so we hold the per-email total to 20MB.

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MESSAGE_STATUSES).optional(),
  // "true" → only sandbox sends (the test inbox); "false" → only live mail.
  sandbox: z.enum(["true", "false"]).optional(),
  // "true" → only sends to a reserved test recipient (the forced-outcome
  // addresses). Those are real sends, so they're otherwise indistinguishable
  // from live mail in this list.
  test: z.enum(["true", "false"]).optional(),
});

const eventBody = z.object({
  event: z.enum(["delivered", "opened", "clicked", "bounced", "complained"]),
  url: z.string().url().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  reason: z.string().optional(),
});

type FromInput = string | { email: string; name?: string } | undefined;

async function resolveFrom(
  from: FromInput,
  subTenant: SubTenant | null,
  workspace: Workspace,
): Promise<{ email: string; name?: string }> {
  if (typeof from === "string") return { email: from };
  if (from) return { email: from.email, name: from.name };
  if (subTenant) return { email: `no-reply@${subTenant.sendingDomain}`, name: subTenant.name };
  // No address named → send from the org's own verified sender if it set one up
  // (the whole point of "send from your own email"); else the rootmail no-reply.
  const own = await defaultSenderFor(workspace.organizationId);
  if (own) return { email: own.email, name: own.displayName ?? workspace.name };
  return { email: `no-reply@${env.ROOTMAIL_DOMAIN}`, name: workspace.name };
}

/**
 * The single read gate for one message: GET, audit trail, proof bundle and event
 * recording all come through here.
 *
 * Scoping MUST match the list endpoint (see `/v1/messages`): acting as a client
 * narrows to that client's mail; no header means the whole workspace. Filtering
 * on workspace alone let a caller scoped to client A fetch client B's message,
 * audit trail and SIGNED PROOF BUNDLE by id — the worst possible leak for a
 * proof product. Not "not found" but a 404 either way: an id that exists in a
 * sibling tenant must be indistinguishable from one that doesn't exist.
 */
async function getScopedMessage(req: FastifyRequest, id: string): Promise<Message> {
  const conditions = [eq(messages.id, id), eq(messages.workspaceId, req.auth.workspace.id)];
  if (req.auth.subTenant) conditions.push(eq(messages.subTenantId, req.auth.subTenant.id));
  const [message] = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .limit(1);
  if (!message) throw Errors.notFound(`Message ${id} not found`);
  return message;
}

/**
 * Sandbox mail is simulated and free — except mail to a reserved test recipient,
 * which takes the real provider path so the sandbox can prove actual delivery.
 * Free + real needs a bound: cap those at SANDBOX_TEST_SENDS_PER_DAY per day.
 */
async function assertSandboxTestCapacity(workspaceId: string): Promise<void> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.sandbox, true),
        like(messages.toEmail, `%@${TEST_RECIPIENT_DOMAIN}`),
        gte(messages.createdAt, since),
      ),
    );
  if ((row?.n ?? 0) >= SANDBOX_TEST_SENDS_PER_DAY) {
    throw Errors.rateLimited(
      `Sandbox test sends are limited to ${SANDBOX_TEST_SENDS_PER_DAY} per day. They're free but they really do go out, so the allowance resets at midnight UTC — or run them from your live workspace, where they count as ordinary sends.`,
    );
  }
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // --- Send ---------------------------------------------------------------
  app.post("/v1/messages", async (req, reply) => {
    await requirePermission(req, "messages.send");
    const body = parse(sendBody, req.body);
    const { workspace, subTenant: headerSub, mode, apiKey, user } = req.auth;

    /**
     * Idempotency key: the body field OR the `Idempotency-Key` request header.
     *
     * The docs have promised the header in two places since they were written
     * (`packages/docs/src/content/concepts.ts` and `sending.ts`) and the SDK has
     * always SENT it (`packages/sdk/src/client.ts`) — but nothing here ever read
     * it. The SDK was safe only by accident, because `Messages.create` also puts
     * the key in the body; a developer following the documented HTTP contract
     * and sending only the header got NO idempotency at all, which means a
     * duplicate email on every retry, silently. That is precisely the failure
     * this endpoint exists to prevent, on a promise we publish.
     *
     * The body still wins when both are present, so no existing caller changes
     * behaviour. Read it once here rather than at the three sites below, so the
     * fast path, the insert and the race-loser lookup cannot disagree.
     */
    const headerIdem = req.headers["idempotency-key"];
    const idempotencyKey =
      body.idempotency_key ?? (typeof headerIdem === "string" && headerIdem.trim() !== ""
        ? headerIdem.trim()
        : undefined);
    // Who's sending: an API key (SDK) or a logged-in dashboard user.
    const sender = apiKey
      ? { actor: "api_key", actorId: apiKey.id }
      : user
        ? { actor: "user", actorId: user.id }
        : { actor: "system", actorId: null };

    // Resolve the effective sub-tenant (header wins; body must agree).
    let subTenant = headerSub;
    if (body.sub_tenant_id) {
      if (headerSub && headerSub.id !== body.sub_tenant_id) {
        throw Errors.badRequest("sub_tenant_id conflicts with the X-Rootmail-Subtenant header");
      }
      if (!headerSub) {
        const [st] = await db
          .select()
          .from(subTenants)
          .where(
            and(eq(subTenants.id, body.sub_tenant_id), eq(subTenants.workspaceId, workspace.id)),
          )
          .limit(1);
        if (!st) throw Errors.notFound(`Sub-tenant ${body.sub_tenant_id} not found`);
        subTenant = st;
      }
    }

    // Downgrade guard: sending through a sub-tenant requires the subtenants
    // feature on the current plan, so an org that downgraded away from it can't
    // keep sending through its existing sub-tenants. 402 feature_locked.
    if (subTenant) await requireFeature(req, "subtenants");

    // Reputation pause. Checked BEFORE the verification guard and in BOTH modes:
    // a paused client is paused, and a sandbox that pretended otherwise would send
    // its operator hunting for a bug instead of showing them the real reason. This
    // is what finally makes SUBTENANT_STATUSES' "disabled" mean something.
    if (subTenant && subTenant.reputationState === "paused") {
      throw Errors.badRequest(
        `Sending is paused for "${subTenant.name}" (${subTenant.sendingDomain}). ` +
          `${subTenant.reputationReason ?? "Its bounce or complaint rate crossed the limit."} ` +
          // Point at the screen FIRST. The dashboard now shows the rates, the
          // threshold that was crossed and a resume control; sending an operator
          // to curl an endpoint when there is a page for it is the trap door
          // with no ladder that this whole loop was built to avoid.
          `Review the numbers and resume them at ${env.DASHBOARD_URL.replace(/\/$/, "")}/sub-tenants/${subTenant.id} ` +
          `(or POST /v1/sub-tenants/${subTenant.id}/resume).`,
      );
    }

    if (subTenant && subTenant.status !== "verified" && mode === "live") {
      throw Errors.badRequest(
        `Sub-tenant ${subTenant.id} domain "${subTenant.sendingDomain}" is not verified (status: ${subTenant.status})`,
      );
    }

    const subTenantId = subTenant?.id ?? null;
    const toEmail = typeof body.to === "string" ? body.to : body.to.email;

    // Idempotency fast path.
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspace.id),
            eq(messages.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        void reply.header("Idempotent-Replayed", "true");
        return reply.status(200).send(serializeMessage(existing));
      }
    }

    // Per-wing enforcement: TRANSACTIONAL sends reserve against the block
    // allowance; marketing/sales sends are covered by the contact-priced marketing
    // wing (recorded for visibility, never billed against blocks).
    const sendKind = sendKindOf(body.type);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, workspace.organizationId))
      .limit(1);

    // Per-ORGANIZATION burst brake, on top of the daily allowance.
    //
    // The global limiter keys on the credential, so an account could multiply
    // its own ceiling by minting more API keys — nothing caps how many. Keyed
    // here on the organization, that stops mattering. It also stops a full day's
    // allowance leaving in the first two minutes after midnight, which daily
    // quota accounting alone permits.
    if (org) {
      const burst = await checkAndCount(`send:${org.id}`, ORG_SENDS_PER_MINUTE, 60);
      if (!burst.allowed) {
        throw Errors.rateLimited(
          `You're sending faster than ${ORG_SENDS_PER_MINUTE} messages a minute. Retry in ${burst.retryInSec}s — this is a burst limit, not your daily allowance.`,
        );
      }
    }

    // The staff stop-switch, on the path this route actually takes. It went into
    // `assertCanSend` first, which this route never calls — only the retry route
    // does — so a suspended account carried on sending and only its RE-sends were
    // refused. Checked here, and again in the worker for mail already queued.
    if (org?.sendingSuspended) {
      throw Errors.forbidden(
        org.sendingSuspendedReason?.trim()
          ? `Sending is suspended for this account: ${org.sendingSuspendedReason}`
          : "Sending is suspended for this account. Contact support to resolve it.",
      );
    }
    // Verify the sender, then atomically reserve quota (transactional only). The
    // reserve is the single source of truth for the cap (no read-then-write race);
    // replays are short-circuited by the idempotency check above.
    // A sandbox send to a reserved test recipient is REAL — bound it.
    if (mode === "test" && testRecipientFor(toEmail)) {
      await assertSandboxTestCapacity(workspace.id);
    }
    if (mode === "live" && org) {
      await assertEmailVerified(org);
      if (sendKind === "transactional") {
        // Transactional volume is metered against the monthly allowance AND the
        // per-day burst cap — same two walls whether this call came from the web
        // app, the SDK, the CLI, or a raw HTTP request.
        if (!(await tryConsumeQuota(org))) {
          await assertTransactionalSendCapacity(org, 1); // throws the specific 402 (monthly vs daily)
        }
      } else if (!(await tryConsumeMarketing(org))) {
        // Marketing volume is metered against the contact-scaled monthly + daily caps.
        await assertMarketingSendCapacity(org, 1); // throws the specific 402 (monthly vs daily)
      }
    }

    // Resolve content from a template or inline html.
    let subjectSrc = body.subject;
    let htmlSrc = body.html;
    let textSrc = body.text ?? null;
    let templateId: string | null = null;
    let templateVersion: number | null = null;

    if (body.template || body.template_id) {
      const tpl = await loadTemplate(workspace.id, subTenantId, {
        slug: body.template,
        id: body.template_id,
      });
      if (!tpl) throw Errors.notFound(`Template "${body.template ?? body.template_id}" not found`);
      templateId = tpl.id;
      templateVersion = tpl.currentVersion;
      subjectSrc = body.subject ?? tpl.subject;
      htmlSrc = tpl.html;
      textSrc = tpl.text ?? null;
    }

    if (!subjectSrc || !htmlSrc) {
      throw Errors.validation(
        "Provide a `template`/`template_id`, or both `subject` and `html`.",
      );
    }

    // Personalize for the recipient: a saved contact's details (name, first_name,
    // custom fields…) fill the template's {{placeholders}} automatically, the
    // caller's explicit variables override them, and our signed per-recipient
    // unsubscribe URL wins over any caller-supplied value of the same name.
    const contact = await findContact(workspace.id, subTenantId, toEmail);

    // Bulk marketing already draws from audiences the customer built. This is the
    // single-send path, and without this guard it was a way to put marketing mail
    // in front of an address typed from anywhere — which is cold email, and is
    // exactly what we tell recipients and our provider we do not do.
    //
    // Transactional is deliberately untouched: a receipt or a password reset goes
    // to whoever took the action, and requiring them to be a saved contact first
    // would break the honest case to police the dishonest one.
    if ((body.type === "marketing" || body.type === "sales") && !contact) {
      throw Errors.badRequest(
        `${toEmail} isn't in your audience, so we can't send marketing to them. Marketing and sales mail can only go to people you collected — add them through a signup form, or import them and confirm you have their permission. Transactional mail (receipts, password resets) has no such restriction.`,
      );
    }
    // Minted before render() because {{view_in_browser_url}} has to name this
    // message and be substituted into the body; the insert below reuses it.
    const id = newId("message");
    const variables = {
      ...contactVariables(contact, toEmail),
      ...body.variables,
      unsubscribe_url: unsubscribeUrl({ w: workspace.id, e: toEmail, s: subTenantId }),
      view_in_browser_url: viewInBrowserUrl(id),
    };

    let rendered = render({
      subject: subjectSrc,
      html: htmlSrc,
      text: textSrc,
      variables,
    });
    // CAN-SPAM: marketing/sales mail must carry the sender's postal address + an
    // unsubscribe link. Inject BEFORE hashing so the Layer-3 proof matches the
    // email actually sent. Transactional mail is exempt.
    if (body.type === "marketing" || body.type === "sales") {
      // The address is REQUIRED, not best-effort. `appendComplianceFooter` takes
      // it as optional and renders an unsubscribe-only footer without it, so for
      // years a customer who skipped one settings field would have sent
      // knowingly non-compliant commercial mail — 15 U.S.C. §7704(a)(5) requires
      // a physical postal address on every commercial email, our own Terms §4
      // tell customers it is mandatory, and our provider's AUP forbids sending
      // in violation of applicable law. Refusing is the only version of that
      // which is true.
      if (!org?.postalAddress?.trim()) {
        throw Errors.badRequest(
          "Add your business postal address before sending marketing or sales email. The law requires a real physical address on commercial mail, and we won't send it without one. Set it under Settings → Organization. Transactional mail is unaffected.",
        );
      }
      rendered = {
        ...rendered,
        ...appendComplianceFooter(rendered, {
          postalAddress: org.postalAddress,
          unsubscribeUrl: variables.unsubscribe_url,
        }),
      };
    }
    // Free-plan live mail carries the small "Sent with rootmail" footer (removed by
    // upgrading). After compliance, before the hash — so proof matches what's sent.
    if (mode === "live" && org && wingBrandingRequired(body.type, org)) {
      rendered = { ...rendered, ...appendBrandingFooter(rendered, { url: env.MARKETING_URL }) };
    }
    const contentHash = sha256Hex(rendered.html);
    const from = await resolveFrom(body.from, subTenant, workspace);
    // A caller-chosen From must be an address the org actually controls: a
    // verified sender identity, the sub-tenant's verified domain, or the platform
    // domain — otherwise SES would reject it downstream with a cryptic error.
    if (body.from) {
      const fromDomain = from.email.split("@")[1]?.toLowerCase() ?? "";
      const tenantDomain = subTenant && fromDomain === subTenant.sendingDomain.toLowerCase();
      const platformDomain = fromDomain === env.ROOTMAIL_DOMAIN.toLowerCase();
      const verified = org ? await verifiedSenderFor(org.id, from.email) : null;
      if (!tenantDomain && !platformDomain && !verified) {
        throw Errors.validation(
          `"${from.email}" isn't a verified sender for this organization. Verify it under Settings → Sending, or leave From empty to use your workspace address.`,
        );
      }
    }
    // While our sending account is provider-limited, mail to an address the
    // provider has not verified is refused BY THE PROVIDER — with its wording,
    // after the message is queued, surfacing as "Email address is not verified.
    // The following identities failed the check in region US-EAST-1". That is
    // AWS explaining our constraint to our customer, which is the wrong voice
    // and the wrong moment. Catch it here and say what to do about it.
    // Applies ONLY when this message will actually go through OUR SES account.
    //
    // The first cut checked the sandbox flag alone, which made it fire wherever
    // SES was not the sender at all — CI runs MAIL_PROVIDER=mock and every send
    // was refused. Worse, an organization that has connected their OWN provider
    // has no relationship with our sandbox whatsoever; blocking their mail on it
    // would defeat the entire point of letting them bring their own account.
    // Same mistake as gating sub-tenant verification on SES a few days ago:
    // an SES constraint is only a constraint when SES is doing the sending.
    const usesPlatformSes = env.MAIL_PROVIDER === "ses" && env.SES_SANDBOX_MODE !== "false";
    const [ownProvider] = usesPlatformSes
      ? await db
          .select({ id: orgSendingProviders.id })
          .from(orgSendingProviders)
          .where(
            and(
              eq(orgSendingProviders.organizationId, workspace.organizationId),
              eq(orgSendingProviders.status, "active"),
            ),
          )
          .limit(1)
      : [undefined];

    if (usesPlatformSes && !ownProvider && mode === "live" && !testRecipientFor(toEmail)) {
      const [ok] = await db
        .select({ status: verifiedRecipients.status })
        .from(verifiedRecipients)
        .where(
          and(
            eq(verifiedRecipients.workspaceId, workspace.id),
            eq(verifiedRecipients.email, toEmail),
            eq(verifiedRecipients.status, "verified"),
          ),
        )
        .limit(1);
      if (!ok) {
        throw Errors.badRequest(
          `While rootmail is in its provider's sandbox we can only deliver to addresses that have confirmed they want mail from us. ${toEmail} hasn't yet. Add them under Testing & sandbox and they'll get one confirmation email — after they click it, this send will work. Sandbox-mode sends and our reserved test addresses are unaffected.`,
        );
      }
    }

    const suppressed = await isSuppressed(workspace.id, subTenantId, toEmail, body.type);

    // Resolve attachment references to owned assets (scoped to the workspace),
    // preserving the caller's order. The worker fetches the bytes at send time.
    let messageAttachments: MessageAttachment[] = [];
    if (body.attachments?.length) {
      const ids = [...new Set(body.attachments.map((a) => a.id))];
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.workspaceId, workspace.id), inArray(assets.id, ids)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const missing = ids.filter((i) => !byId.has(i));
      if (missing.length) throw Errors.notFound(`Attachment not found: ${missing.join(", ")}`);
      messageAttachments = body.attachments.map((a) => {
        const r = byId.get(a.id)!;
        return { url: r.url, filename: r.filename, content_type: r.contentType, size: r.size };
      });
      const total = messageAttachments.reduce((s, a) => s + a.size, 0);
      // The SAME limit the worker enforces when it fetches the bytes. This said
      // 20MB while the worker refused anything over 7MB, so an 8MB attachment was
      // accepted here and failed at send — the worst place to find out. SES
      // rejects a message over 10MB after base64 inflation, so 7MB raw is the
      // real ceiling either way.
      if (total > MAX_ATTACHMENT_BYTES) {
        throw Errors.validation(
          `Attachments total ${(total / 1048576).toFixed(1)}MB — the limit is ${Math.round(MAX_ATTACHMENT_BYTES / 1048576)}MB per email.`,
        );
      }
    }

    // Content rules, before anything is queued and after attachments resolve —
    // the filenames are only known once they do. Both rules are definite: an
    // attachment that executes on the recipient's machine, and a link to a host
    // an operator has blocked. Refused rather than flagged, because a warning
    // nobody reads about a message already on the wire is not a control.
    const contentFindings = scanContent({
      html: rendered.html,
      text: rendered.text,
      attachments: messageAttachments.map((a) => ({ filename: a.filename })),
      blockedHosts: (env.BLOCKED_LINK_HOSTS ?? "").split(",").filter(Boolean),
    });
    if (contentFindings.length) {
      throw Errors.badRequest(contentFindings.map((f) => f.detail).join(" "));
    }

    const sendAt = body.send_at ? new Date(body.send_at) : null;

    const insertedRows = await db
      .insert(messages)
      .values({
        id,
        workspaceId: workspace.id,
        subTenantId,
        type: body.type,
        toEmail,
        toContactId: contact?.id ?? null,
        fromEmail: from.email,
        fromName: from.name ?? null,
        // Only an explicit caller Reply-To is stamped here; the org's reply mode
        // (capture into the Replies inbox vs. the sender's own mailbox) is resolved
        // once the conversation is opened below.
        replyTo: body.reply_to ?? null,
        subject: rendered.subject,
        templateId,
        templateVersion,
        variables,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
        contentHash,
        sendAt,
        priority: body.priority,
        tags: body.tags,
        metadata: body.metadata,
        attachments: messageAttachments,
        idempotencyKey: idempotencyKey ?? null,
        status: suppressed ? "suppressed" : "queued",
        sandbox: mode === "test",
      })
      .onConflictDoNothing()
      .returning();

    // Lost an idempotency race — return the winner.
    if (insertedRows.length === 0) {
      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspace.id),
            eq(messages.idempotencyKey, idempotencyKey ?? ""),
          ),
        )
        .limit(1);
      if (!existing) throw Errors.internal("Insert conflict could not be resolved");
      // This request reserved quota above but produced no new send (the winner
      // did) — refund the reservation so the duplicate doesn't over-count.
      if (mode === "live" && org) {
        if (sendKind === "marketing") await recordMarketingSend(org.id, -1);
        else {
          await recordSend(org.id, -1, sendKind);
          await recordTransactionalDaily(org.id, -1); // the day counter too
        }
      }
      void reply.header("Idempotent-Replayed", "true");
      return reply.status(200).send(serializeMessage(existing));
    }

    const message = insertedRows[0];

    // Roll this send into the recipient's conversation (Layer 2) and stamp the
    // Reply-To per the org's reply mode — capture into the Replies inbox by
    // default, the sender's own mailbox if they chose that, an explicit Reply-To
    // always wins. Best-effort: threading never fails the send.
    try {
      const thread = await openConversationForSend({
        workspaceId: workspace.id,
        subTenantId,
        contactEmail: toEmail,
        subject: rendered.subject,
        fromEmail: from.email,
        messageId: message.id,
        bodyHtml: rendered.html,
        bodyText: rendered.text,
      });
      const replyTo = resolveReplyTo({
        replyMode: org?.replyMode ?? null,
        conversationId: thread.id,
        fromEmail: from.email,
        explicit: body.reply_to ?? null,
        replyDomain: org ? activeReplyDomain(org) : null,
      });
      if (replyTo !== message.replyTo) {
        await db.update(messages).set({ replyTo, updatedAt: new Date() }).where(eq(messages.id, message.id));
        message.replyTo = replyTo;
      }
    } catch {
      /* threading is non-critical to the send */
    }

    await writeAudit(db, {
      workspaceId: workspace.id,
      subTenantId,
      messageId: id,
      event: "queued",
      actor: sender.actor,
      actorId: sender.actorId,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (suppressed) {
      await writeAudit(db, {
        workspaceId: workspace.id,
        subTenantId,
        messageId: id,
        event: "suppressed",
        actor: "system",
        metadata: { reason: "recipient is on the suppression list" },
      });
      return reply.status(200).send(serializeMessage(message));
    }

    const delayMs = sendAt ? Math.max(0, sendAt.getTime() - Date.now()) : 0;
    await enqueueSend({ messageId: id, workspaceId: workspace.id }, { priority: body.priority, delayMs });

    return reply.status(202).send(serializeMessage(message));
  });

  // --- List ---------------------------------------------------------------
  app.get("/v1/messages", async (req) => {
    const q = parse(listQuery, req.query);
    const conditions = [eq(messages.workspaceId, req.auth.workspace.id)];
    // Acting as a client (X-Rootmail-Subtenant) narrows the log to that client's
    // mail; without it the log stays the whole workspace, sub-tenants included.
    // (Deliberately unlike templates/contacts, which fall back to workspace-only
    // rows: a LOG should default to everything that happened, not a slice.)
    if (req.auth.subTenant) conditions.push(eq(messages.subTenantId, req.auth.subTenant.id));
    if (q.status) conditions.push(eq(messages.status, q.status));
    if (q.sandbox) conditions.push(eq(messages.sandbox, q.sandbox === "true"));
    if (q.test) {
      const isTest = like(messages.toEmail, `%@${TEST_RECIPIENT_DOMAIN}`);
      conditions.push(q.test === "true" ? isTest : not(isTest));
    }
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(q.limit);
    // Engagement (first open/click) lives on the audit trail, not the message
    // row — join it in one grouped query so each row can show how far it got.
    const engagement = new Map<string, { openedAt?: Date; clickedAt?: Date }>();
    if (rows.length) {
      const ev = await db
        .select({
          messageId: auditEntries.messageId,
          event: auditEntries.event,
          at: sql<Date>`min(${auditEntries.occurredAt})`,
        })
        .from(auditEntries)
        .where(
          and(
            inArray(auditEntries.messageId, rows.map((r) => r.id)),
            inArray(auditEntries.event, ["opened", "clicked"]),
          ),
        )
        .groupBy(auditEntries.messageId, auditEntries.event);
      for (const e of ev) {
        if (!e.messageId) continue;
        const cur = engagement.get(e.messageId) ?? {};
        if (e.event === "opened") cur.openedAt = e.at;
        else cur.clickedAt = e.at;
        engagement.set(e.messageId, cur);
      }
    }
    return { object: "list", data: rows.map((m) => serializeMessage(m, engagement.get(m.id))) };
  });

  // --- Retrieve -----------------------------------------------------------
  app.get("/v1/messages/:id", async (req) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const [ev] = await db
      .select({
        openedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'opened')`,
        clickedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'clicked')`,
      })
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id));
    return serializeMessage(message, ev ?? undefined);
  });

  // --- Retry a failed send ------------------------------------------------
  // Re-sends a message that never made it out. The interesting part is what it
  // REFUSES: anything the provider already accepted (a retry would put a second
  // copy in someone's inbox, and there is no undo), and anything the recipient
  // decided (a suppression, a bounce). See canRetryMessage.
  app.post("/v1/messages/:id/retry", async (req) => {
    await requirePermission(req, "messages.send");
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);

    const verdict = canRetryMessage({
      status: message.status,
      providerMessageId: message.providerMessageId,
      error: message.error,
    });
    if (!verdict.retryable) throw Errors.badRequest(verdict.reason);

    // Re-check suppression AT RETRY TIME, not against what was true when the
    // message first failed. Someone may have unsubscribed or hard-bounced in
    // between, and a retry must not be a way to reach them anyway.
    if (await isSuppressed(message.workspaceId, message.subTenantId, message.toEmail, message.type)) {
      throw Errors.badRequest(
        "This recipient has since been added to your suppression list, so this message can no longer be sent to them.",
      );
    }

    // A retry is a real send: it counts against the quota like any other.
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.auth.workspace.organizationId))
      .limit(1);
    if (req.auth.mode === "live" && org) await assertCanSend(org);

    const attempt = message.retryCount + 1;
    const [updated] = await db
      .update(messages)
      .set({ status: "queued", error: null, retryCount: attempt, updatedAt: new Date() })
      .where(eq(messages.id, message.id))
      .returning();

    await db.insert(auditEntries).values({
      id: newId("audit"),
      workspaceId: message.workspaceId,
      subTenantId: message.subTenantId,
      messageId: message.id,
      event: "retried",
      actor: authActor(req.auth).actor,
      actorId: authActor(req.auth).actorId,
      metadata: { attempt, previous_error: message.error },
    });

    // `attempt` is what makes this a DISTINCT job. Without it the queue's
    // per-message idempotency silently swallows the retry.
    await enqueueSend(
      { messageId: message.id, workspaceId: message.workspaceId },
      { priority: "normal", attempt },
    );

    return { ...serializeMessage(updated), retried: true, attempt };
  });

  // --- Audit trail --------------------------------------------------------
  app.get("/v1/messages/:id/audit", async (req) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const trail = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id))
      .orderBy(asc(auditEntries.occurredAt));
    return { message_id: message.id, status: message.status, trail: trail.map(serializeAudit) };
  });

  // --- Layer 3 proof bundle (Enterprise) ----------------------------------
  // An Ed25519-signed, exportable record of what was sent + its full lifecycle.
  app.get("/v1/messages/:id/proof", async (req) => {
    await requireFeature(req, "proof");
    await requirePermission(req, "proof.read");
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const trail = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id))
      .orderBy(asc(auditEntries.occurredAt));

    const bundle = {
      message_id: message.id,
      content_hash: message.contentHash,
      subject: message.subject,
      to: message.toEmail,
      from: message.fromEmail,
      status: message.status,
      workspace_id: message.workspaceId,
      created_at: message.createdAt.toISOString(),
      audit: trail.map((a) => ({
        event: a.event,
        occurred_at: a.occurredAt.toISOString(),
        actor: a.actor,
      })),
      issued_at: new Date().toISOString(),
    };
    return { object: "proof", bundle, ...signProof(bundle) };
  });

  // --- Record a lifecycle event (provider callback / simulation) ----------
  app.post("/v1/messages/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const body = parse(eventBody, req.body);

    // Simulation is a SANDBOX affordance and nothing else.
    //
    // In live mode this route let a customer rewrite their own delivery
    // outcomes: iterate your bounces, POST {"event":"delivered"} at each, and
    // the next reputation sweep reads a clean bounce rate because
    // `outcomeCounts` groups on `messages.status`. That is the enforcement loop
    // we describe to our provider being switched off by the account it exists
    // to restrain. The audit row recorded `simulated: true`, but nothing read it.
    if (req.auth.mode === "live") {
      throw Errors.forbidden(
        "Delivery events for live mail come from your email provider, not from you. Simulated events are a sandbox tool — switch to your Sandbox workspace to exercise them.",
      );
    }

    // A send to a reserved test recipient took the REAL provider path, so its
    // outcome arrives from the provider. Letting a simulated event overwrite it
    // would make the one honest signal in the sandbox a lie.
    if (testRecipientFor(message.toEmail)) {
      throw Errors.badRequest(
        "This went out through your real provider, so its delivery events come from the provider — they can't be simulated.",
      );
    }

    await writeAudit(db, {
      workspaceId: message.workspaceId,
      subTenantId: message.subTenantId,
      messageId: message.id,
      event: body.event,
      actor: "system",
      ip: body.ip ?? null,
      userAgent: body.user_agent ?? null,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      metadata: {
        simulated: true,
        ...(body.url ? { url: body.url } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
      },
    });

    const statusForEvent: Partial<Record<typeof body.event, Message["status"]>> = {
      delivered: "delivered",
      bounced: "bounced",
      complained: "complained",
    };
    const nextStatus = statusForEvent[body.event];
    if (nextStatus) {
      // Persist the reason onto the message so get_message surfaces *why* it
      // bounced/complained (mirrors the real SES feedback path).
      const carriesReason = body.event === "bounced" || body.event === "complained";
      await db
        .update(messages)
        .set({
          status: nextStatus,
          ...(carriesReason && body.reason ? { error: body.reason } : {}),
          updatedAt: new Date(),
        })
        .where(eq(messages.id, message.id));
    }

    if (body.event === "bounced" || body.event === "complained") {
      await addSuppression(
        message.workspaceId,
        message.subTenantId,
        message.toEmail,
        body.event === "bounced" ? "bounce" : "complaint",
        message.id,
      );
    }

    return reply.status(202).send({ ok: true, message_id: message.id, event: body.event });
  });
}
