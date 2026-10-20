import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, eq } from "drizzle-orm";
import { closeQueues, closeRedis, encryptSecret, env, isEnvelope, newId, sealCredentials } from "@rootmail/core";
import { byoActiveForOrg, closeDb, db, messages, organizations, orgSendingProviders, suppressions, users } from "@rootmail/db";
import { createSession, provisionAccount } from "../lib/auth";
import { capOrg } from "../lib/billing";
import { txDailyLimitForOrg } from "../lib/wings";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { forgetOrgProvider } from "../../../worker/src/providers/for-org";

// Bring-your-own-provider, PR (a). Every AWS / Mailgun call is intercepted.
const stamp = Date.now();
const KEY = "test-provider-credentials-key-0123456789";
const MG_SIGNING = "mg-signing-key-for-tests";
let app: Awaited<ReturnType<typeof buildServer>>;
let a: Awaited<ReturnType<typeof provisionAccount>>;
let b: Awaited<ReturnType<typeof provisionAccount>>;
let authA: { authorization: string };
const prev = {
  enabled: env.BYO_PROVIDER_ENABLED,
  key: env.PROVIDER_CREDENTIALS_KEY,
  mgKey: env.MAILGUN_WEBHOOK_SIGNING_KEY,
};
const OLD_KEYS = ["object", "id", "provider", "sending_domain", "status", "last_error", "verified_at", "last_checked_at"].sort();

before(async () => {
  env.BYO_PROVIDER_ENABLED = undefined;
  env.PROVIDER_CREDENTIALS_KEY = KEY;
  a = await provisionAccount({ email: `byo-a-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "BYO A" });
  b = await provisionAccount({ email: `byo-b-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "BYO B" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.user.id));
  authA = { authorization: `Bearer ${(await createSession(a.user.id, a.production.id)).token}` };
  app = await buildServer();
  await app.ready();
  // Mailgun domain check → active; Mailgun send never reached in these tests.
  mock.method(globalThis, "fetch", async (url: string | URL) => {
    if (String(url).includes("/domains/")) return new Response(JSON.stringify({ domain: { state: "active" } }), { status: 200 });
    throw new Error(`unexpected fetch ${String(url)}`);
  });
  mock.method(SESv2Client.prototype, "send", async (command: { constructor: { name: string } }) => {
    if (command.constructor.name === "GetAccountCommand") return { ProductionAccessEnabled: true };
    if (command.constructor.name === "ListEmailIdentitiesCommand") {
      return { EmailIdentities: [
        { IdentityName: "acme.example", SendingEnabled: true, VerificationStatus: "SUCCESS" },
        { IdentityName: "pending.example", SendingEnabled: false, VerificationStatus: "PENDING" },
        { IdentityName: "rootmail.io", SendingEnabled: true, VerificationStatus: "SUCCESS" },
      ] };
    }
    throw new Error(`unexpected SES ${command.constructor.name}`);
  });
});

after(async () => {
  await app?.close();
  for (const acct of [a, b]) {
    if (!acct) continue;
    await db.delete(organizations).where(eq(organizations.id, acct.organizationId));
    await db.delete(users).where(eq(users.id, acct.user.id));
  }
  mock.restoreAll();
  env.BYO_PROVIDER_ENABLED = prev.enabled;
  env.PROVIDER_CREDENTIALS_KEY = prev.key;
  env.MAILGUN_WEBHOOK_SIGNING_KEY = prev.mgKey;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

const req = (method: "GET" | "POST" | "DELETE", url: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url, headers: authA, payload });
const flagOrg = (orgId: string, on: boolean) => db.update(organizations).set({ byoProvider: on }).where(eq(organizations.id, orgId));

function mgBody(key: string, messageId: string, event: string, recipient: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = `tok-${Math.random().toString(36).slice(2)}`;
  const signature = createHmac("sha256", key).update(`${timestamp}${token}`).digest("hex");
  return { signature: { timestamp, token, signature }, "event-data": { event, recipient, message: { headers: { "message-id": messageId } } } };
}

describe("flag OFF — prod behaviour preserved (characterization)", () => {
  it("GET with no connection is the exact pre-BYO body", async () => {
    await flagOrg(a.organizationId, true); // org flag alone does nothing while the global switch is off
    const res = (await req("GET", "/v1/sending-provider")).json();
    assert.deepEqual(Object.keys(res).sort(), ["connected", "note", "object"]);
    assert.equal(res.byo, undefined);
  });

  it("POST stores legacy enc:v1 and returns only the pre-BYO fields; extra BYO fields are ignored", async () => {
    const res = await req("POST", "/v1/sending-provider", {
      provider: "mailgun", api_key: "key-abcdefgh12345678", domain: "mg.acme.example", region: "us", webhook_signing_key: "ignored-key",
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.deepEqual(Object.keys(body).filter((k) => k !== "note").sort(), OLD_KEYS);
    assert.equal(res.body.includes("key-abcdefgh12345678"), false);
    const [row] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(isEnvelope(row.credentials), false);
    assert.ok(row.credentials.startsWith("enc:v1:"));
    assert.equal(row.webhookToken, null);
    assert.equal(row.credentialHint, null);
  });

  it("the beta daily cap is untouched", async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
    assert.equal(await byoActiveForOrg(a.organizationId), false);
    const capped = await capOrg(org);
    assert.equal(capped, org, "same object, no extra work");
    assert.equal(txDailyLimitForOrg(capped), env.BETA_DAILY_SEND_CAP);
  });

  it("per-tenant webhook routes do not exist", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/webhooks/byo/abcdefghijklmnopqrstuvwx/mailgun", payload: {} });
    assert.equal(res.statusCode, 404);
  });

  it("the global Mailgun webhook still verifies with our key", async () => {
    env.MAILGUN_WEBHOOK_SIGNING_KEY = "global-key-1234";
    const bad = await app.inject({ method: "POST", url: "/v1/webhooks/mailgun", payload: mgBody("wrong", "x", "delivered", "r@x.test") });
    assert.equal(bad.statusCode, 403);
    const ok = await app.inject({ method: "POST", url: "/v1/webhooks/mailgun", payload: mgBody("global-key-1234", `nomatch-${stamp}`, "delivered", "r@x.test") });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().unmatched, true);
  });

  after(async () => {
    await db.delete(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
  });
});

describe("flag ON", () => {
  let token = "";

  before(async () => {
    env.BYO_PROVIDER_ENABLED = "true";
    await flagOrg(a.organizationId, true);
    await flagOrg(b.organizationId, true);
  });
  after(() => {
    env.BYO_PROVIDER_ENABLED = undefined;
  });

  it("Mailgun needs a webhook signing key, because suppression is mandatory", async () => {
    const res = await req("POST", "/v1/sending-provider", { provider: "mailgun", api_key: "key-abcdefgh12345678", domain: "mg.acme.example" });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error?.message ?? res.body, /signing key/);
  });

  it("refuses to route a Rootmail domain through a tenant account", async () => {
    const res = await req("POST", "/v1/sending-provider", { provider: "mailgun", api_key: "key-abcdefgh12345678", domain: "rootmail.io", webhook_signing_key: MG_SIGNING });
    assert.equal(res.statusCode, 400);
  });

  it("connects: envelope-sealed, masked hint, webhook URL, never the secret", async () => {
    const res = await req("POST", "/v1/sending-provider", {
      provider: "mailgun", api_key: "key-abcdefgh12345678", domain: "mg.acme.example", webhook_signing_key: MG_SIGNING,
    });
    assert.equal(res.statusCode, 200, res.body);
    for (const secret of ["key-abcdefgh12345678", MG_SIGNING]) assert.equal(res.body.includes(secret), false);
    const body = res.json();
    assert.equal(body.byo, true);
    assert.equal(body.credential_hint, "key-…5678");
    assert.deepEqual(body.sending_domains, ["mg.acme.example"]);
    assert.match(body.webhook_url, /\/v1\/webhooks\/byo\/[A-Za-z0-9_-]+\/mailgun$/);
    token = body.webhook_url.split("/").at(-2);
    const [row] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(isEnvelope(row.credentials), true);
    // GET shows the same, still without the secret
    const get = await req("GET", "/v1/sending-provider");
    assert.equal(get.body.includes("key-abcdefgh12345678"), false);
    assert.equal(get.json().webhook_url, body.webhook_url);
  });

  it("replacing keeps the webhook URL stable", async () => {
    const res = await req("POST", "/v1/sending-provider", {
      provider: "mailgun", api_key: "key-zzzzzzzz87654321", domain: "mg.acme.example", webhook_signing_key: MG_SIGNING,
    });
    assert.equal(res.json().webhook_url.split("/").at(-2), token);
  });

  it("SES: lists only verified, send-enabled identities and drops Rootmail's", async () => {
    // on org B, so A keeps its Mailgun connection for the webhook tests
    const authB = { authorization: `Bearer ${(await createSession(b.user.id, b.production.id)).token}` };
    const noTopic = await app.inject({ method: "POST", url: "/v1/sending-provider", headers: authB, payload: {
      provider: "ses", access_key_id: "AKIAEXAMPLE12345678", secret_access_key: "secretsecretsecret1234",
    } });
    assert.equal(noTopic.statusCode, 400, "SNS topic required");
    const res = await app.inject({ method: "POST", url: "/v1/sending-provider", headers: authB, payload: {
      provider: "ses", access_key_id: "AKIAEXAMPLE12345678", secret_access_key: "secretsecretsecret1234",
      sns_topic_arn: "arn:aws:sns:us-east-1:123456789012:feedback", configuration_set: "their-set",
    } });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().sending_domains, ["acme.example"]);
    assert.equal(res.json().configuration_set, "their-set");
    assert.equal(res.json().status, "awaiting_feedback", "no sending until the SNS subscription confirms");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, b.organizationId));
    assert.equal(txDailyLimitForOrg(await capOrg(org)), env.BETA_DAILY_SEND_CAP, "cap stays until feedback is live");
    assert.equal(res.body.includes("secretsecretsecret1234"), false);
  });

  it("lifts the beta daily cap only for a flagged org on an ACTIVE own provider", async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
    assert.equal(org.isBeta, true);
    const capped = await capOrg(org);
    assert.equal((capped as { byoActive?: boolean }).byoActive, true);
    assert.notEqual(txDailyLimitForOrg(capped), env.BETA_DAILY_SEND_CAP);
    await db.update(orgSendingProviders).set({ status: "pending" }).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(txDailyLimitForOrg(await capOrg(org)), env.BETA_DAILY_SEND_CAP);
    await db.update(orgSendingProviders).set({ status: "active" }).where(eq(orgSendingProviders.organizationId, a.organizationId));
  });

  it("Mailgun webhook: tenant key verified, suppression applied, other orgs isolated", async () => {
    const pmid = `<byo-${stamp}@mg.acme.example>`;
    const mine = newId("message");
    const theirs = newId("message");
    // Same provider message id in BOTH orgs: only A's may be touched via A's URL.
    await db.insert(messages).values([
      { id: mine, workspaceId: a.production.id, toEmail: `bounce-${stamp}@example.test`, fromEmail: "hi@mg.acme.example", subject: "s", status: "sent", providerMessageId: pmid },
      { id: theirs, workspaceId: b.production.id, toEmail: `other-${stamp}@example.test`, fromEmail: "hi@acme.example", subject: "s", status: "sent", providerMessageId: pmid },
    ]);
    const url = `/v1/webhooks/byo/${token}/mailgun`;
    assert.equal((await app.inject({ method: "POST", url, payload: mgBody("wrong-key", pmid, "complained", "x@x.test") })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: `/v1/webhooks/byo/${token}/ses`, payload: {} })).statusCode, 404, "provider must match");
    const ok = await app.inject({ method: "POST", url, payload: mgBody(MG_SIGNING, pmid.replace(/^<|>$/g, ""), "complained", `bounce-${stamp}@example.test`) });
    assert.equal(ok.statusCode, 200, ok.body);
    const sup = await db.select().from(suppressions).where(and(eq(suppressions.workspaceId, a.production.id), eq(suppressions.email, `bounce-${stamp}@example.test`)));
    assert.equal(sup.length, 1);
    assert.equal(sup[0].source, "byo:mailgun");
    const leaked = await db.select().from(suppressions).where(eq(suppressions.workspaceId, b.production.id));
    assert.equal(leaked.length, 0, "org B untouched");
  });

  it("refuses a From the tenant's provider has not verified, and the beta+ address", async () => {
    const send = (from: string) => req("POST", "/v1/messages", { from, to: `t-${stamp}@example.test`, subject: "Hi", html: "<p>Hi</p>" });
    const res = await send("hello@not-verified.example");
    assert.equal(res.statusCode, 400, res.body);
    assert.match(res.body, /isn't verified at your provider/);
    const beta = await send(`beta+${a.organizationId}@rootmail.io`);
    assert.equal(beta.statusCode, 400, beta.body);
    assert.match(beta.body, /beta\+ address belongs to Rootmail/);
    const ok = await send("hello@mg.acme.example");
    assert.doesNotMatch(ok.body, /verified at your provider|isn't a verified sender/);
  });

  it("a failing connection fails the message loudly — never our SES", async () => {
    await db.update(orgSendingProviders).set({ credentials: sealCredentials("not json") })
      .where(eq(orgSendingProviders.organizationId, a.organizationId));
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `loud-${stamp}@example.test`, fromEmail: "hi@mg.acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your Mailgun account/);
    assert.equal(m.providerMessageId, null);
    const [conn] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.match(conn.lastError ?? "", /Not sent/);
  });

  it("unflagged org with the same broken connection keeps today's silent fallback", async () => {
    await flagOrg(a.organizationId, false);
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `quiet-${stamp}@example.test`, fromEmail: "hi@mg.acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.doesNotMatch(m.error ?? "", /Not sent: your/);
    await flagOrg(a.organizationId, true);
  });

  it("flagged: credentials missing fields fail loudly instead of borrowing our env keys", async () => {
    await db.update(orgSendingProviders).set({ credentials: sealCredentials("{}") })
      .where(eq(orgSendingProviders.organizationId, a.organizationId));
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `empty-${stamp}@example.test`, fromEmail: "hi@mg.acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your Mailgun account/);
  });

  it("disconnecting fails mail still queued for the tenant's account", async () => {
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `queued-${stamp}@example.test`, fromEmail: "hi@mg.acme.example", subject: "s", status: "queued" });
    assert.equal((await req("DELETE", "/v1/sending-provider")).statusCode, 200);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /disconnected your own provider/);
    // reconnect for the next test
    await req("POST", "/v1/sending-provider", { provider: "mailgun", api_key: "key-abcdefgh12345678", domain: "mg.acme.example", webhook_signing_key: MG_SIGNING });
  });

  it("the BYO Mailgun route never falls back to OUR signing key", async () => {
    env.MAILGUN_WEBHOOK_SIGNING_KEY = "global-key-1234";
    const [conn] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    await db.update(orgSendingProviders).set({ credentials: sealCredentials(JSON.stringify({ apiKey: "k", domain: "mg.acme.example" })) })
      .where(eq(orgSendingProviders.id, conn.id));
    const res = await app.inject({ method: "POST", url: `/v1/webhooks/byo/${conn.webhookToken}/mailgun`, payload: mgBody("global-key-1234", "x", "complained", "x@x.test") });
    assert.equal(res.statusCode, 403);
  });

  it("legacy single-key rows still open after BYO is switched on", async () => {
    await db.update(orgSendingProviders).set({ credentials: encryptSecret(JSON.stringify({ apiKey: "k", domain: "mg.acme.example", region: "us" })) })
      .where(eq(orgSendingProviders.organizationId, a.organizationId));
    forgetOrgProvider(a.organizationId);
    assert.equal(await byoActiveForOrg(a.organizationId), true);
  });
});
