import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { eq } from "drizzle-orm";
import { BYO_SMTP_DAILY_CAP, closeQueues, closeRedis, env, isEnvelope, newId, openCredentials } from "@rootmail/core";
import { smtpClient } from "@rootmail/core/smtp-client";
import { closeDb, db, messages, organizations, orgSendingProviders, users } from "@rootmail/db";
import { createSession, provisionAccount } from "../lib/auth";
import { capOrg } from "../lib/billing";
import { marketingDailyLimitForOrg, txDailyLimitForOrg } from "../lib/wings";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { forgetOrgProvider } from "../../../worker/src/providers/for-org";

// BYO PR (b) part 1: SMTP. The network is stubbed at smtpClient; the SSRF guard,
// TLS and AUTH themselves are exercised against a real server in
// packages/core/src/smtp-client.test.ts.
const stamp = Date.now();
const KEY = "test-provider-credentials-key-0123456789";
const PASSWORD = "smtp-password-never-returned";
let app: Awaited<ReturnType<typeof buildServer>>;
let a: Awaited<ReturnType<typeof provisionAccount>>;
let authA: { authorization: string };
const prev = { enabled: env.BYO_PROVIDER_ENABLED, key: env.PROVIDER_CREDENTIALS_KEY };
const verifyCalls: unknown[] = [];
const sendCalls: { envelope: { from: string; to: string }; raw: string }[] = [];
let sendError: Error | null = null;

const smtp = (over: Record<string, unknown> = {}) => ({
  provider: "smtp", host: "smtp.acme.example", port: 587, username: "mailer@acme.example", password: PASSWORD,
  sending_domains: ["Acme.example"], ...over,
});

before(async () => {
  env.BYO_PROVIDER_ENABLED = undefined;
  env.PROVIDER_CREDENTIALS_KEY = KEY;
  a = await provisionAccount({ email: `smtp-a-${stamp}@example.test`, passwordHash: null, betaInviteId: "local-test-invite", name: "SMTP A" });
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.user.id));
  authA = { authorization: `Bearer ${(await createSession(a.user.id, a.production.id)).token}` };
  app = await buildServer();
  await app.ready();
  mock.method(smtpClient, "verifySmtpLogin", async (login: unknown) => {
    verifyCalls.push(login);
    return { ok: true };
  });
  mock.method(smtpClient, "sendSmtpRaw", async (_login: unknown, envelope: { from: string; to: string }, raw: string) => {
    if (sendError) throw sendError;
    sendCalls.push({ envelope, raw });
  });
});

after(async () => {
  await app?.close();
  if (a) {
    await db.delete(organizations).where(eq(organizations.id, a.organizationId));
    await db.delete(users).where(eq(users.id, a.user.id));
  }
  mock.restoreAll();
  env.BYO_PROVIDER_ENABLED = prev.enabled;
  env.PROVIDER_CREDENTIALS_KEY = prev.key;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

const req = (method: "GET" | "POST" | "DELETE", url: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url, headers: authA, payload });
const flagOrg = (on: boolean) => db.update(organizations).set({ byoProvider: on }).where(eq(organizations.id, a.organizationId));

describe("flag OFF — SMTP does not exist (characterization)", () => {
  it("an SMTP connect fails with the same validation error as before this PR, contacts nothing, stores nothing", async () => {
    await flagOrg(true); // the org flag alone does nothing while the global switch is off
    const res = await req("POST", "/v1/sending-provider", smtp());
    // Pre-PR: provider "smtp" was not in the discriminated union → validation error.
    const unknown = await req("POST", "/v1/sending-provider", { ...smtp(), provider: "carrier-pigeon" });
    assert.equal(res.statusCode, unknown.statusCode);
    assert.deepEqual(Object.keys(res.json()).sort(), Object.keys(unknown.json()).sort());
    assert.equal(verifyCalls.length, 0);
    const rows = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(rows.length, 0);
  });

  it("global switch on but org NOT flagged: same refusal", async () => {
    env.BYO_PROVIDER_ENABLED = "true";
    await flagOrg(false);
    const res = await req("POST", "/v1/sending-provider", smtp());
    const unknown = await req("POST", "/v1/sending-provider", { ...smtp(), provider: "carrier-pigeon" });
    assert.equal(res.statusCode, unknown.statusCode);
    assert.equal(verifyCalls.length, 0);
    env.BYO_PROVIDER_ENABLED = undefined;
  });

  it("the daily-limit maths is unchanged without a ceiling", () => {
    const org = { isBeta: false, isInternal: false } as Parameters<typeof txDailyLimitForOrg>[0];
    assert.equal(txDailyLimitForOrg({ ...org, byoActive: true }), txDailyLimitForOrg(org));
    assert.equal(marketingDailyLimitForOrg({ ...org, byoActive: true }), marketingDailyLimitForOrg(org));
  });
});

describe("flag ON — SMTP", () => {
  before(async () => {
    env.BYO_PROVIDER_ENABLED = "true";
    await flagOrg(true);
  });
  after(() => {
    env.BYO_PROVIDER_ENABLED = undefined;
  });

  it("refuses Rootmail domains", async () => {
    const res = await req("POST", "/v1/sending-provider", smtp({ sending_domains: ["acme.example", "rootmail.io"] }));
    assert.equal(res.statusCode, 400, res.body);
    assert.match(res.body, /Rootmail domain/);
  });

  it("refuses when the server check fails, and says why", async () => {
    mock.method(smtpClient, "verifySmtpLogin", async () => ({ ok: false, reason: "the server rejected the username or password (535)" }), { times: 1 });
    const res = await req("POST", "/v1/sending-provider", smtp());
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /username or password/);
  });

  it("connects: login checked (nothing sent), envelope-sealed, hint only, no webhook, limitation stated", async () => {
    const before = sendCalls.length;
    const res = await req("POST", "/v1/sending-provider", smtp());
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(sendCalls.length, before, "no test message");
    assert.equal(res.body.includes(PASSWORD), false);
    const body = res.json();
    assert.equal(body.provider, "smtp");
    assert.equal(body.status, "active");
    assert.equal(body.webhook_url, null);
    assert.equal(body.feedback.kind, "none");
    assert.match(body.note, /bounces go back to your own mailbox/);
    assert.deepEqual(body.sending_domains, ["acme.example"]);
    assert.equal(body.credential_hint, "smtp.acme.example:587 · user mail…mple");
    const [row] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.equal(isEnvelope(row.credentials), true);
    assert.deepEqual(JSON.parse(openCredentials(row.credentials)), { host: "smtp.acme.example", port: 587, username: "mailer@acme.example", password: PASSWORD });
    const get = await req("GET", "/v1/sending-provider");
    assert.equal(get.body.includes(PASSWORD), false);
  });

  it("an SMTP connection lifts the beta cap only to a conservative ceiling (no bounce feedback)", async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.organizationId));
    const capped = await capOrg(org);
    assert.equal(txDailyLimitForOrg(capped), Math.min(BYO_SMTP_DAILY_CAP, txDailyLimitForOrg({ ...org, byoActive: true })));
    assert.ok(txDailyLimitForOrg(capped) <= BYO_SMTP_DAILY_CAP);
    assert.notEqual(txDailyLimitForOrg(capped), env.BETA_DAILY_SEND_CAP);
  });

  it("API admission: From must be on a declared domain", async () => {
    const send = (from: string) => req("POST", "/v1/messages", { from, to: `t-${stamp}@example.test`, subject: "Hi", html: "<p>Hi</p>" });
    const bad = await send("hello@elsewhere.example");
    assert.equal(bad.statusCode, 400, bad.body);
    assert.match(bad.body, /isn't verified at your provider/);
  });

  it("sends through the tenant's server: envelope From is theirs (DSNs go to their mailbox)", async () => {
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `ok-${stamp}@example.test`, fromEmail: "hi@acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "sent", m.error ?? "");
    assert.equal(m.provider, "smtp");
    assert.match(m.providerMessageId ?? "", /^<.+@.+>$/);
    const last = sendCalls.at(-1)!;
    assert.deepEqual(last.envelope, { from: "hi@acme.example", to: `ok-${stamp}@example.test` });
    assert.ok(last.raw.includes(`Message-ID: ${m.providerMessageId}`));
  });

  it("a refusing server fails the message loudly, records it on the card, never our SES", async () => {
    sendError = new Error("couldn't connect to the server (timed out)");
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `fail-${stamp}@example.test`, fromEmail: "hi@acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await assert.rejects(processSend({ messageId: id } as Parameters<typeof processSend>[0]));
    sendError = null;
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your SMTP server didn't accept this message \(couldn't connect/);
    assert.equal(m.providerMessageId, null);
    const [conn] = await db.select().from(orgSendingProviders).where(eq(orgSendingProviders.organizationId, a.organizationId));
    assert.match(conn.lastError ?? "", /couldn't connect/);
  });

  it("unreadable SMTP credentials fail loudly too", async () => {
    await db.update(orgSendingProviders).set({ credentials: "garbage" }).where(eq(orgSendingProviders.organizationId, a.organizationId));
    forgetOrgProvider(a.organizationId);
    const id = newId("message");
    await db.insert(messages).values({ id, workspaceId: a.production.id, toEmail: `bad-${stamp}@example.test`, fromEmail: "hi@acme.example", subject: "s", status: "queued", renderedHtml: "<p>x</p>", renderedText: "x" });
    await processSend({ messageId: id } as Parameters<typeof processSend>[0]);
    const [m] = await db.select().from(messages).where(eq(messages.id, id));
    assert.equal(m.status, "failed");
    assert.match(m.error ?? "", /^Not sent: your SMTP server/);
  });
});
