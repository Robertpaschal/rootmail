import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  announceProviderChange,
  BYO_AWAITING_FEEDBACK,
  byoWebhookUrl,
  Errors,
  encryptSecret,
  env,
  isRootmailOwnedDomain,
  maskSecret,
  newId,
  sealCredentials,
  SMTP_FEEDBACK_LIMITATION,
} from "@rootmail/core";
import { betaSenderDomain, byoStateForOrg, db, messages, orgSendingProviders, workspaces } from "@rootmail/db";
import { requirePermission } from "../lib/permissions";
import { checkSendingCredentials, checkSesRole, checkSmtpCredentials, listSesVerifiedIdentities, type CredentialCheck } from "../lib/provider-check";
import { assumeRoleAvailable, externalIdFor, ROLE_HINT_PREFIX, ROLE_ARN_RE, tenantPolicies } from "@rootmail/core/aws-assume";
import { parse } from "../lib/validate";

// Connecting your own sending account.
//
// rootmail's value to a platform that already sends email is the layer above the
// provider — per-client domains, per-client reputation, suppression, isolation,
// proof — not the delivery itself. Letting them keep their own provider means
// their mail leaves on their reputation, under approval they already hold, and
// our provider's opinion of us stops being a gate on their launch.

const sesBody = z.object({
  provider: z.literal("ses"),
  access_key_id: z.string().min(16),
  secret_access_key: z.string().min(16),
  region: z.string().min(2).default("us-east-1"),
  // BYO (flagged orgs only; ignored otherwise).
  configuration_set: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  sns_topic_arn: z.string().trim().regex(/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/).optional(),
});
const mailgunBody = z.object({
  provider: z.literal("mailgun"),
  api_key: z.string().min(8),
  domain: z.string().min(3),
  region: z.enum(["us", "eu"]).default("us"),
  // BYO (flagged orgs only; ignored otherwise).
  webhook_signing_key: z.string().min(8).optional(),
});
/** SMTP is BYO-only: a flagged org may connect its own server (see lib/provider-check + core/smtp-guard). */
const smtpBody = z.object({
  provider: z.literal("smtp"),
  host: z.string().trim().min(3).max(253),
  port: z.coerce.number().int(),
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  /** Domains (or exact addresses) this server may send as. The From must be one of them. */
  sending_domains: z.array(z.string().trim().toLowerCase().min(3).max(320)).min(1).max(20),
});
/**
 * SES through an IAM role the tenant owns (BYO only, and only when ops set
 * BYO_ASSUMER_ROLE_ARN). Stored as provider "ses", so feedback works exactly as
 * with keys: their SNS topic, a confirmed subscription, then sending.
 */
const sesRoleBody = z.object({
  provider: z.literal("ses_role"),
  role_arn: z.string().trim().regex(ROLE_ARN_RE),
  region: z.string().trim().regex(/^[a-z]{2}(-[a-z]+)+-\d$/).default("us-east-1"),
  configuration_set: sesBody.shape.configuration_set,
  sns_topic_arn: sesBody.shape.sns_topic_arn,
});
/** Exactly the pre-BYO schema: what an unflagged org is validated against. */
const legacyConnectBody = z.discriminatedUnion("provider", [sesBody, mailgunBody]);
const connectBody = z.discriminatedUnion("provider", [sesBody, mailgunBody, smtpBody, sesRoleBody]);
type ConnectBody = z.infer<typeof connectBody>;

const SMTP_NOT_AVAILABLE = "SMTP isn't available for this organization.";
const ROLE_NOT_AVAILABLE = "Connecting with an IAM role isn't available for this organization.";

/** What a flagged tenant needs to create the role: our assumer, their external id, the two policies. */
function assumeRoleSetup(orgId: string) {
  const externalId = externalIdFor(orgId);
  if (!assumeRoleAvailable() || !externalId) return null;
  const policies = tenantPolicies(externalId);
  return {
    assumer_role_arn: env.BYO_ASSUMER_ROLE_ARN,
    external_id: externalId,
    trust_policy: policies.trust,
    permissions_policy: policies.permissions,
  };
}

const BYO_DISCONNECTED_ERROR =
  "Not sent: you disconnected your own provider while this was queued. Nothing was sent through Rootmail's account.";

/** Domains we refuse to route through anyone else's account. */
const ownedExtras = () => [env.INBOUND_DOMAIN, betaSenderDomain()];

/** Never returns the credentials — only whether they work. */
function serialize(row: typeof orgSendingProviders.$inferSelect) {
  return {
    object: "sending_provider",
    id: row.id,
    provider: row.provider,
    sending_domain: row.sendingDomain,
    status: row.status,
    last_error: row.lastError,
    verified_at: row.verifiedAt,
    last_checked_at: row.lastCheckedAt,
  };
}

/**
 * The BYO view: the same fields plus what a flagged tenant needs. Secrets are
 * never included — only a masked hint.
 */
function serializeByo(row: typeof orgSendingProviders.$inferSelect) {
  const base = env.BYO_WEBHOOK_BASE_URL || env.PUBLIC_API_URL;
  return {
    ...serialize(row),
    byo: true,
    credential_hint: row.credentialHint,
    sending_domains: row.sendingDomains ?? [],
    configuration_set: row.configurationSet,
    sns_topic_arn: row.snsTopicArn,
    // SMTP has no event API, so no webhook; bounces go to the tenant's mailbox.
    feedback: row.provider === "smtp" ? { kind: "none", note: SMTP_FEEDBACK_LIMITATION } : { kind: "webhook" },
    assume_role: assumeRoleSetup(row.organizationId),
    webhook_url: row.webhookToken && row.provider !== "smtp"
      ? byoWebhookUrl(base, row.webhookToken, row.provider === "mailgun" ? "mailgun" : "ses")
      : null,
  };
}

/** Flagged save: verified identities, envelope-sealed secret, hint, webhook token. */
async function byoValues(body: ConnectBody, existingToken: string | null, orgId: string) {
  if (!env.PROVIDER_CREDENTIALS_KEY) {
    throw Errors.badRequest("Own-provider sending isn't configured on this server yet (no credentials key). Nothing was saved.");
  }
  let identities: string[];
  let externalId: string | null = null;
  if (body.provider === "ses" || body.provider === "ses_role") {
    if (!body.sns_topic_arn) {
      throw Errors.badRequest("Add the SNS topic that receives your SES bounces and complaints. Without it we can't keep your suppression list.");
    }
    if (body.provider === "ses_role") externalId = externalIdFor(orgId);
    const listed = body.provider === "ses"
      ? await listSesVerifiedIdentities(body)
      : await checkSesRole({ orgId, role_arn: body.role_arn, external_id: externalId!, region: body.region });
    if (!listed.ok) throw Errors.badRequest(`Those credentials didn't work: ${listed.reason}`);
    identities = listed.identities;
  } else if (body.provider === "smtp") {
    identities = [...new Set(body.sending_domains.map((d) => d.replace(/\.$/, "")))];
  } else {
    if (!body.webhook_signing_key) {
      throw Errors.badRequest("Add your Mailgun webhook signing key. Without it we can't verify bounces and complaints, so we can't keep your suppression list.");
    }
    identities = [body.domain.toLowerCase()];
  }
  const owned = identities.filter((d) => isRootmailOwnedDomain(d, ownedExtras()));
  if (body.provider === "mailgun" && owned.length) {
    throw Errors.badRequest(`${body.domain} is a Rootmail domain. Connect a domain your Mailgun account owns.`);
  }
  if (body.provider === "smtp" && owned.length) {
    throw Errors.badRequest(`${owned.join(", ")} ${owned.length === 1 ? "is a Rootmail domain" : "are Rootmail domains"}. List only domains your SMTP server sends for.`);
  }
  identities = identities.filter((d) => !owned.includes(d));
  if (identities.length === 0) {
    throw Errors.badRequest("Your provider has no verified sending domain we can use yet. Verify one there, then connect again.");
  }
  const hint =
    body.provider === "ses_role"
      ? `${ROLE_HINT_PREFIX}${body.role_arn} · external ID ${externalId}`
      : body.provider === "ses"
      ? `${maskSecret(body.access_key_id)} · secret ${maskSecret(body.secret_access_key)}`
      : body.provider === "smtp"
        ? `${body.host.toLowerCase()}:${body.port} · user ${maskSecret(body.username)}`
        : maskSecret(body.api_key);
  const credentials = sealCredentials(
    JSON.stringify(
      body.provider === "ses_role"
        ? { roleArn: body.role_arn, externalId, region: body.region }
        : body.provider === "ses"
        ? { accessKeyId: body.access_key_id, secretAccessKey: body.secret_access_key, region: body.region }
        : body.provider === "smtp"
          ? { host: body.host.toLowerCase(), port: body.port, username: body.username, password: body.password }
          : { apiKey: body.api_key, domain: body.domain, region: body.region, webhookSigningKey: body.webhook_signing_key },
    ),
  );
  return {
    credentials,
    credentialHint: hint,
    sendingDomains: identities,
    configurationSet: body.provider === "ses" || body.provider === "ses_role" ? (body.configuration_set ?? null) : null,
    snsTopicArn: body.provider === "ses" || body.provider === "ses_role" ? (body.sns_topic_arn ?? null) : null,
    webhookToken: existingToken ?? randomBytes(24).toString("base64url"),
  };
}

export async function sendingProviderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/sending-provider", async (req) => {
    const byo = await byoStateForOrg(req.auth.workspace.organizationId);
    if (byo.flagged) {
      return byo.connection
        ? serializeByo(byo.connection)
        : {
            object: "sending_provider",
            connected: false,
            byo: true,
            assume_role: assumeRoleSetup(req.auth.workspace.organizationId),
            note: "Your mail sends through Rootmail's account, inside its beta limits. Connect your own provider to send on your domain, without the daily cap or the confirmed-recipients rule.",
          };
    }
    const [row] = await db
      .select()
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, req.auth.workspace.organizationId))
      .limit(1);
    return row
      ? serialize(row)
      : {
          object: "sending_provider",
          connected: false,
          note: "Your mail is sending through rootmail's own account. Connect your own provider and it will send from yours instead — your domains, your reputation, your limits.",
        };
  });

  app.post("/v1/sending-provider", async (req) => {
    await requirePermission(req, "domains.manage");
    const body = parse(connectBody, req.body);
    const orgId = req.auth.workspace.organizationId;
    const byo = await byoStateForOrg(orgId);
    // SMTP exists only behind the BYO flag. Unflagged, the request is judged by
    // the pre-BYO schema, so it fails with exactly the validation error it did before.
    if ((body.provider === "smtp" || body.provider === "ses_role") && !byo.flagged) {
      parse(legacyConnectBody, req.body);
      throw Errors.badRequest(body.provider === "smtp" ? SMTP_NOT_AVAILABLE : ROLE_NOT_AVAILABLE);
    }
    if (body.provider === "ses_role" && !assumeRoleAvailable()) throw Errors.badRequest(ROLE_NOT_AVAILABLE);

    // Checked BEFORE it is stored. A credential that fails here would fail
    // mid-campaign otherwise, and "we saved it, it just doesn't work" is the
    // worst version of this feature.
    // An IAM role is checked inside byoValues (assume, GetAccount, list identities).
    const check = body.provider === "smtp"
      ? await checkSmtpCredentials(body)
      : body.provider === "ses_role"
        ? ({ ok: true } as CredentialCheck)
        : await checkSendingCredentials(body);
    if (!check.ok) {
      throw Errors.badRequest(`Those credentials didn't work: ${check.reason}`);
    }

    if (byo.flagged) {
      const extra = await byoValues(body, byo.connection?.webhookToken ?? null, orgId);
      const storedAs = body.provider === "ses_role" ? "ses" : body.provider;
      const now = new Date();
      const values = {
        provider: storedAs,
        sendingDomain: extra.sendingDomains[0] ?? null,
        // SES sends only once its SNS topic has confirmed the subscription to
        // our URL — suppression is mandatory, so no feedback means no sending.
        status: storedAs === "ses" ? BYO_AWAITING_FEEDBACK : "active",
        lastError: null,
        lastCheckedAt: now,
        verifiedAt: now,
        updatedAt: now,
        ...extra,
      };
      const [row] = byo.connection
        ? await db.update(orgSendingProviders).set(values).where(eq(orgSendingProviders.id, byo.connection.id)).returning()
        : await db.insert(orgSendingProviders).values({ id: newId("sendingProvider"), organizationId: orgId, ...values }).returning();
      await announceProviderChange(orgId);
      return {
        ...serializeByo(row),
        note: body.provider === "smtp"
          ? `Connected. We sent nothing; your server accepted a secure login. Sending as: ${extra.sendingDomains.join(", ")}. ${SMTP_FEEDBACK_LIMITATION}`
          : storedAs === "ses"
          ? `Saved. We sent nothing; we checked the credentials and found ${extra.sendingDomains.length} verified identit${extra.sendingDomains.length === 1 ? "y" : "ies"}. Subscribe the URL below to your SNS topic — sending starts when the subscription confirms.`
          : `Connected. We sent nothing; we checked that the credentials work and found ${extra.sendingDomains.length} verified identit${extra.sendingDomains.length === 1 ? "y" : "ies"}. Point your Mailgun webhooks at the URL below.`,
      };
    }

    // Unreachable (refused above for unflagged orgs); narrows the type.
    if (body.provider === "smtp" || body.provider === "ses_role") throw Errors.badRequest(SMTP_NOT_AVAILABLE);
    const credentials = encryptSecret(
      JSON.stringify(
        body.provider === "ses"
          ? { accessKeyId: body.access_key_id, secretAccessKey: body.secret_access_key, region: body.region }
          : { apiKey: body.api_key, domain: body.domain, region: body.region },
      ),
    );
    const sendingDomain = body.provider === "mailgun" ? body.domain : (check.domain ?? null);
    const now = new Date();

    const [existing] = await db
      .select({ id: orgSendingProviders.id })
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, orgId))
      .limit(1);

    const values = {
      provider: body.provider,
      credentials,
      sendingDomain,
      status: "active",
      lastError: null,
      lastCheckedAt: now,
      verifiedAt: now,
      updatedAt: now,
    };

    const [row] = existing
      ? await db
          .update(orgSendingProviders)
          .set(values)
          .where(eq(orgSendingProviders.id, existing.id))
          .returning()
      : await db
          .insert(orgSendingProviders)
          .values({ id: newId("sendingProvider"), organizationId: orgId, ...values })
          .returning();

    await announceProviderChange(orgId);
    return {
      ...serialize(row),
      note: `Connected. New mail sends through your own ${body.provider === "ses" ? "Amazon SES" : "Mailgun"} account — on your reputation and your limits, not ours.`,
    };
  });

  app.delete("/v1/sending-provider", async (req) => {
    await requirePermission(req, "domains.manage");
    const orgId = req.auth.workspace.organizationId;
    const [row] = await db
      .select()
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, orgId))
      .limit(1);
    if (!row) throw Errors.notFound("No sending provider is connected.");

    await db.delete(orgSendingProviders).where(eq(orgSendingProviders.id, row.id));
    // Flagged: mail already queued was admitted for THEIR account (beta cap
    // lifted). It must not drain onto ours after a disconnect.
    const byo = await byoStateForOrg(orgId);
    if (byo.flagged) {
      await db
        .update(messages)
        .set({ status: "failed", error: BYO_DISCONNECTED_ERROR, updatedAt: new Date() })
        .where(and(eq(messages.status, "queued"), inArray(messages.workspaceId,
          db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, orgId)))));
    }
    await announceProviderChange(orgId);
    return {
      object: "sending_provider",
      disconnected: true,
      note: "Your mail will send through rootmail's own account again, subject to its limits.",
    };
  });
}
