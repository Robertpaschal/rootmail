import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CONTACT_PACK_SIZE,
  env,
  Errors,
  subscribeConfirmUrl,
  verifySubscribeConfirmToken,
} from "@rootmail/core";
import {
  admitSubscriber,
  billableContactCount,
  contactPackUnits,
  db,
  emitContactEvent,
  lists,
  organizations,
  workspaces,
} from "@rootmail/db";
import { assertCanSend } from "../lib/billing";
import { dispatchMessage } from "../lib/dispatch";
import { defaultSenderFor } from "../lib/senders";
import { unsubPage } from "../lib/unsub-page";
import { contactLimitForOrg } from "../lib/wings";
import { parse } from "../lib/validate";

// PUBLIC audience-growth surface: the hosted signup page and any embedded form
// on the customer's own site post here; the double opt-in confirmation link
// lands here. No auth — the list must have signup enabled, the confirm token is
// HMAC-signed, and a honeypot field swallows dumb bots.

const subscribeBody = z.object({
  list_id: z.string().min(1),
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  /** Honeypot — humans never fill it; bots do. Silently accepted + dropped. */
  website: z.string().optional(),
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ListContext {
  list: typeof lists.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
  org: typeof organizations.$inferSelect;
}

async function loadListContext(listId: string): Promise<ListContext | null> {
  const [row] = await db
    .select({ list: lists, workspace: workspaces, org: organizations })
    .from(lists)
    .innerJoin(workspaces, eq(workspaces.id, lists.workspaceId))
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(lists.id, listId))
    .limit(1);
  return row ?? null;
}

/** Contact slots the org still has across its audiences (Infinity = unlimited). */
async function capacityRemaining(org: typeof organizations.$inferSelect): Promise<number> {
  const base = contactLimitForOrg(org);
  if (base === -1) return Number.POSITIVE_INFINITY;
  const packs = await contactPackUnits(org.id);
  const used = await billableContactCount(org.id);
  return base + packs * CONTACT_PACK_SIZE - used;
}

/** The branded double opt-in email — from the org's own verified sender. */
function confirmEmailHtml(orgName: string, audienceName: string, confirmUrl: string): string {
  const safeOrg = escapeHtml(orgName);
  const safeAud = escapeHtml(audienceName);
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:28px 20px;color:#111">
  <h2 style="margin:0 0 4px">${safeOrg}</h2>
  <p style="margin:0 0 20px;color:#555;font-size:14px">Please confirm your subscription</p>
  <p style="font-size:15px;line-height:1.6">You (or someone using this address) asked to join <strong>${safeAud}</strong> from ${safeOrg}. Click below to confirm — otherwise, just ignore this email and nothing happens.</p>
  <p style="margin:24px 0"><a href="${confirmUrl}" style="background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
  <p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:14px;margin-top:26px">Sent by ${safeOrg} via rootmail. If you didn't request this, no action is needed — you won't be subscribed.</p>
</div>`;
}

type SubscribeState = "confirm_sent" | "subscribed" | "waitlisted";

export async function subscribeRoutes(app: FastifyInstance): Promise<void> {
  // The embed form on a customer's site posts urlencoded; parse it app-wide (this
  // content type is used nowhere else).
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (err) {
      done(err as Error);
    }
  });

  // --- Branding info for the hosted page (public, read-only) ---------------
  app.get("/v1/subscribe/info", async (req) => {
    const { list: listId } = parse(z.object({ list: z.string().min(1) }), req.query);
    const ctx = await loadListContext(listId);
    if (!ctx || !ctx.list.signupEnabled) throw Errors.notFound("This signup page isn't available.");
    return {
      object: "subscribe_info",
      list_id: ctx.list.id,
      audience_name: ctx.list.name,
      org_name: ctx.org.name,
      double_opt_in: ctx.list.doubleOptIn,
      redirect_url: ctx.list.signupRedirectUrl,
    };
  });

  // --- Subscribe (hosted page fetch OR embedded form post) ------------------
  app.post("/v1/subscribe", async (req, reply) => {
    const isForm = (req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
    const body = parse(subscribeBody, req.body);

    const finish = (state: SubscribeState) => {
      if (isForm) {
        // Embedded forms get sent to the hosted page's styled state screen.
        const base = env.DASHBOARD_URL.replace(/\/$/, "");
        return reply.redirect(`${base}/subscribe/${encodeURIComponent(body.list_id)}?state=${state}`, 303);
      }
      return reply.send({ object: "subscription", state });
    };

    // Honeypot tripped — pretend success, change nothing.
    if (body.website && body.website.trim() !== "") return finish("confirm_sent");

    const ctx = await loadListContext(body.list_id);
    if (!ctx || !ctx.list.signupEnabled) throw Errors.notFound("This audience isn't accepting signups.");
    const email = body.email.trim().toLowerCase();
    const name = body.name?.trim() || undefined;

    if (ctx.list.doubleOptIn) {
      // Ask first, add on confirm. The pending signup is recorded as an event so
      // the audience's growth panel can show it; no contact exists yet.
      const confirmUrl = subscribeConfirmUrl({ w: ctx.workspace.id, l: ctx.list.id, e: email, ...(name ? { n: name } : {}) });
      try {
        await assertCanSend(ctx.org);
        const sender = await defaultSenderFor(ctx.org.id);
        await dispatchMessage({
          workspace: ctx.workspace,
          subTenantId: ctx.list.subTenantId,
          org: ctx.org,
          mode: "live",
          type: "transactional",
          to: email,
          fromEmail: sender?.email ?? `no-reply@${env.ROOTMAIL_DOMAIN}`,
          fromName: sender?.displayName ?? ctx.org.name,
          subject: `Confirm your subscription to ${ctx.org.name}`,
          html: confirmEmailHtml(ctx.org.name, ctx.list.name, confirmUrl),
          actor: { actor: "system", actorId: null },
          ip: req.ip,
        });
        await emitContactEvent({
          workspaceId: ctx.workspace.id,
          subTenantId: ctx.list.subTenantId,
          listId: ctx.list.id,
          email,
          kind: "subscribed",
          metadata: { source: "form", pending_confirmation: true, ...(name ? { name } : {}) },
        });
        return finish("confirm_sent");
      } catch {
        // Can't send the confirmation (e.g. send quota exhausted) — degrade to
        // single opt-in rather than silently losing the subscriber.
      }
    }

    const res = await admitSubscriber({
      workspaceId: ctx.workspace.id,
      subTenantId: ctx.list.subTenantId,
      list: { id: ctx.list.id, signupTag: ctx.list.signupTag },
      email,
      name,
      source: "form",
      capacityRemaining: await capacityRemaining(ctx.org),
    });
    return finish(res.state === "subscribed" ? "subscribed" : "waitlisted");
  });

  // --- Double opt-in confirmation landing ----------------------------------
  app.get("/v1/subscribe/confirm", async (req, reply) => {
    const { token } = req.query as { token?: string };
    const payload = token ? verifySubscribeConfirmToken(token) : null;
    if (!payload) {
      return reply
        .type("text/html")
        .code(400)
        .send(unsubPage("Invalid link", "<p>This confirmation link is invalid or has expired.</p>"));
    }

    const ctx = await loadListContext(payload.l);
    if (!ctx || ctx.workspace.id !== payload.w) {
      return reply
        .type("text/html")
        .code(404)
        .send(unsubPage("Not available", "<p>This audience no longer exists.</p>"));
    }

    const res = await admitSubscriber({
      workspaceId: ctx.workspace.id,
      subTenantId: ctx.list.subTenantId,
      list: { id: ctx.list.id, signupTag: ctx.list.signupTag },
      email: payload.e,
      name: payload.n ?? null,
      source: "form",
      confirmed: true,
      capacityRemaining: await capacityRemaining(ctx.org),
    });

    const redirect = ctx.list.signupRedirectUrl;
    const continueHtml = redirect
      ? `<p><a class="btn" href="${escapeHtml(redirect)}">Continue to ${escapeHtml(ctx.org.name)}</a></p>`
      : "";
    // Waitlisted still reads as success to the subscriber — the OWNER sees the
    // truth (and the fix) on the audience's growth panel; the subscriber is
    // admitted automatically the moment room frees up.
    return reply
      .type("text/html")
      .send(
        unsubPage(
          res.state === "subscribed" ? "You're subscribed" : "Almost there",
          `<p>${escapeHtml(payload.e)} ${res.state === "subscribed" ? `is now subscribed to <strong>${escapeHtml(ctx.list.name)}</strong> from ${escapeHtml(ctx.org.name)}.` : `is confirmed — ${escapeHtml(ctx.org.name)} will finish adding you shortly.`}</p>${continueHtml}`,
        ),
      );
  });
}
