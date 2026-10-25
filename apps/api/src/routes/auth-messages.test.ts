import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { AUTH_SUBJECT, closeAuthContentVault, closeQueues, closeRedis, enqueueSendDeferred, env, getAuthContentVault, getSendQueue, hashApiKey } from "@rootmail/core";
import { apiKeys, auditEntries, closeDb, db, messages, orgAddons, organizations, sql, subTenants, suppressions, threadMessages, threads, workspaces } from "@rootmail/db";
import { buildServer } from "../server";
import { processSend } from "../../../worker/src/pipeline";
import { processAuthSend } from "../../../worker/src/auth-send";
import { reconcileAuthMessages } from "../../../worker/src/auth-reconcile";
import { createPostgresHookLedger, createSupabaseEmailHook } from "../../../../packages/supabase/src/index";
import { applySesNotification } from "../lib/ses-events";

const suffix = `auth${Date.now()}`;
const org = `org_${suffix}`, ws = `ws_${suffix}`, tenantA = `tnt_a_${suffix}`, tenantB = `tnt_b_${suffix}`;
const key = `rm_live_${suffix}`, clientKey = `rm_live_client_${suffix}`;
const fixtureSecret = "fixture-only-code-654321";
let app: Awaited<ReturnType<typeof buildServer>>;
let n = 0;
const ids: string[] = [];
const payload = () => ({ policy: "authentication-v1", to: "recipient@example.test", from: `no-reply@${env.ROOTMAIL_DOMAIN}`,
  html: `<p>${fixtureSecret}</p>`, text: fixtureSecret,
  expires_at: new Date(Date.now() + 300_000).toISOString(), idempotency_key: `fixture_request_${suffix}_${n++}` });
const headers = (tenant?: string, credential = key) => ({ authorization: `Bearer ${credential}`, ...(tenant ? { "x-rootmail-subtenant": tenant } : {}) });
const post = (body = payload(), tenant?: string, credential = key) => app.inject({ method: "POST", url: "/v1/auth-messages", headers: headers(tenant, credential), payload: body });
async function row(id: string) { return (await db.select().from(messages).where(eq(messages.id, id)))[0]; }
async function accepted(body = payload(), tenant?: string) {
  const response = await post(body, tenant);
  assert.equal(response.statusCode, 202, response.body);
  ids.push(response.json().id);
  return response.json().id as string;
}

describe("auth message privacy and expiry (mock delivery only)", () => {
  before(async () => {
    assert.equal(env.MAIL_PROVIDER, "mock", "This suite must never use a live provider");
    env.AUTH_CONTENT_REDIS_URL = process.env.AUTH_CONTENT_REDIS_URL ?? "redis://127.0.0.1:6395";
    env.AUTH_CONTENT_KEY = Buffer.alloc(32, 19).toString("base64");
    env.AUTH_MESSAGES_ENABLED = true;
    await getAuthContentVault().assertEphemeral();
    await db.insert(organizations).values({ id: org, name: "Auth fixture", slug: suffix });
    await db.insert(orgAddons).values({ id: `adn_${suffix}`, organizationId: org, addonId: "subtenant_pack", quantity: 5 });
    await db.insert(workspaces).values({ id: ws, organizationId: org, name: "Auth fixture", slug: suffix, environment: "live" });
    for (const id of [tenantA, tenantB]) await db.insert(subTenants).values({ id, workspaceId: ws, name: id,
      sendingDomain: `${id}.example.test`, status: "verified", verificationToken: "fixture", dkimSelector: "rm1", dkimPublicKey: "fixture", dkimPrivateKey: "fixture" });
    for (const [secret, tenant] of [[key, null], [clientKey, tenantA]] as const) await db.insert(apiKeys).values({
      id: `key_${secret}`, workspaceId: ws, subTenantId: tenant, name: "fixture", prefix: "rm_live", last4: "test", keyHash: hashApiKey(secret), mode: "live",
    });
    app = await buildServer();
  });
  after(async () => {
    for (const id of ids) {
      const message = await row(id);
      if (message?.authExpiresAt) await getAuthContentVault().discard({ ...message, authExpiresAt: message.authExpiresAt });
      const job = await getSendQueue().getJob(id);
      await job?.remove();
    }
    await app?.close();
    await db.delete(organizations).where(eq(organizations.id, org));
    await closeQueues(); await closeRedis(); await closeAuthContentVault(); await closeDb();
  });

  it("is disabled by default and rejects invalid payloads without echoing content", async () => {
    env.AUTH_MESSAGES_ENABLED = false;
    assert.equal((await post()).statusCode, 503);
    env.AUTH_MESSAGES_ENABLED = true;
    for (const extra of [{ subject: fixtureSecret }, { metadata: { code: fixtureSecret } }, { send_at: new Date().toISOString() }, { attachments: [] }]) {
      const r = await post({ ...payload(), ...extra });
      assert.equal(r.statusCode, 422);
      assert.ok(!r.body.includes(fixtureSecret));
    }
    const malformed = await app.inject({ method: "POST", url: "/v1/auth-messages", headers: { ...headers(), "content-type": "application/json" }, payload: `{"html":"${fixtureSecret}"` });
    assert.equal(malformed.statusCode, 400);
    assert.ok(!malformed.body.includes(fixtureSecret));
  });

  it("rejects expired and excessively long validity before creating any row", async () => {
    for (const offset of [-1, 5000, 3_700_000]) {
      const r = await post({ ...payload(), expires_at: new Date(Date.now() + offset).toISOString() });
      assert.equal(r.statusCode, 422);
      assert.equal(r.json().error.type, "auth_expired");
    }
  });

  it("persists only non-secret metadata, queues only IDs, and makes no conversation copy", async () => {
    const id = await accepted();
    const message = await row(id);
    assert.equal(message.subject, AUTH_SUBJECT);
    for (const field of ["renderedHtml", "renderedText", "contentHash"] as const) assert.equal(message[field], null);
    assert.deepEqual(message.variables, {});
    assert.ok(!JSON.stringify(message).includes(fixtureSecret));
    const job = await getSendQueue().getJob(id);
    assert.deepEqual(job?.data, { messageId: id, workspaceId: ws });
    assert.equal(job?.opts.attempts, 1);
    assert.equal(job?.opts.priority, 1);
    const copies = await db.select().from(threadMessages).where(eq(threadMessages.messageId, id));
    assert.equal(copies.length, 0);
    const response = await app.inject({ method: "GET", url: `/v1/messages/${id}`, headers: headers() });
    assert.equal(response.json().content_policy, "authentication-v1");
    assert.ok(!response.body.includes(fixtureSecret));
    // Database enforcement protects other writers, not just this route.
    await assert.rejects(db.update(messages).set({ renderedHtml: fixtureSecret }).where(eq(messages.id, id)));
  });

  it("deduplicates simultaneous admissions, rejects conflicts and isolates client namespaces", async () => {
    const body = payload();
    const responses = await Promise.all([post(body, tenantA), post(body, tenantA)]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 202]);
    const id = responses[0].json().id;
    ids.push(id);
    assert.equal(id, responses[1].json().id);
    assert.equal((await post({ ...body, text: "changed" }, tenantA)).statusCode, 409);
    const second = await accepted(body, tenantB);
    assert.notEqual(id, second);
    const forbidden = await post(payload(), tenantB, clientKey);
    assert.equal(forbidden.statusCode, 403);
    const inaccessible = await app.inject({ method: "GET", url: `/v1/messages/${second}`, headers: headers(undefined, clientKey) });
    assert.equal(inaccessible.statusCode, 404);
    const ordinaryReplay = await app.inject({ method: "POST", url: "/v1/messages", headers: headers(),
      payload: { to: body.to, html: "ordinary", subject: "ordinary", idempotency_key: (await row(id)).idempotencyKey } });
    assert.equal(ordinaryReplay.statusCode, 409);
  });

  it("consumes content once, does not simulate delivery, and cannot be manually retried", async () => {
    const id = await accepted();
    let sends = 0;
    const fake = async (_message: unknown, content: { text: string }) => {
      sends++; assert.equal(content.text, fixtureSecret);
      return { provider: "ses", providerMessageId: `fake_${id}` };
    };
    await Promise.all([processSend({ messageId: id, workspaceId: ws }, fake), processSend({ messageId: id, workspaceId: ws }, fake)]);
    assert.equal(sends, 1);
    assert.equal((await row(id)).status, "sent"); // NOT delivered
    await assert.rejects(getAuthContentVault().take({ ...(await row(id)), authExpiresAt: (await row(id)).authExpiresAt! }));
    const retry = await app.inject({ method: "POST", url: `/v1/messages/${id}/retry`, headers: headers() });
    assert.equal(retry.statusCode, 400);
    assert.equal((await db.select().from(threads).where(eq(threads.workspaceId, ws))).length, 0);
  });

  it("checks expiry at worker time and refuses provider failures without recording secrets", async () => {
    const expired = await accepted();
    await db.update(messages).set({ authExpiresAt: new Date(Date.now() - 1) }).where(eq(messages.id, expired));
    let calls = 0;
    const fake = async () => { calls++; throw new Error(fixtureSecret); };
    await processSend({ messageId: expired, workspaceId: ws }, fake);
    assert.equal(calls, 0);
    assert.equal((await row(expired)).error, "auth_expired");
    const failed = await accepted();
    await processSend({ messageId: failed, workspaceId: ws }, fake);
    assert.equal(calls, 1);
    assert.equal((await row(failed)).error, "auth_send_outcome_unknown");
    await processSend({ messageId: failed, workspaceId: ws }, fake);
    assert.equal(calls, 1);
    const evidence = await db.select().from(auditEntries).where(inArray(auditEntries.messageId, [expired, failed]));
    assert.ok(!JSON.stringify(evidence).includes(fixtureSecret));
    assert.ok(!JSON.stringify(await row(failed)).includes(fixtureSecret));
  });

  it("a stale worker cannot fail or purge another worker's claimed send", async () => {
    const id = await accepted();
    const stale = await row(id);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const winner = processSend({ messageId: id, workspaceId: ws }, async () => {
      entered(); await blocked;
      return { provider: "ses", providerMessageId: `fake_${id}` };
    });
    try {
      await started;
      env.AUTH_MESSAGES_ENABLED = false;
      await processAuthSend(stale, async () => { assert.fail("stale worker must not audit a failure"); }, async () => false);
      assert.equal((await row(id)).status, "sending");
    } finally { env.AUTH_MESSAGES_ENABLED = true; release(); await winner; }
    assert.equal((await row(id)).status, "sent");
  });

  it("preserves auth priority and one attempt when deferring a queue job", async () => {
    const messageId = `deferred_${suffix}`;
    await enqueueSendDeferred({ messageId, workspaceId: ws }, 1000, { singleAttempt: true, priority: "high" });
    const jobs = (await getSendQueue().getJobs(["delayed", "prioritized", "waiting"]))
      .filter(job => job.data.messageId === messageId);
    try {
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].opts.attempts, 1);
      assert.equal(jobs[0].opts.priority, 1);
      assert.deepEqual(jobs[0].data, { messageId, workspaceId: ws });
    } finally { await Promise.all(jobs.map(job => job.remove())); }
  });

  it("ignores auth tracking events and scrubs echoed provider diagnostics", async () => {
    const id = await accepted();
    await processSend({ messageId: id, workspaceId: ws }, async () => ({ provider: "ses", providerMessageId: `fake_${id}` }));
    for (const eventType of ["Open", "Click"]) assert.equal(await applySesNotification({ eventType, mail: { messageId: `fake_${id}` },
      click: { link: `https://example.test?token=${fixtureSecret}` }, open: { userAgent: fixtureSecret } }), "ignored");
    await applySesNotification({ eventType: "Bounce", mail: { messageId: `fake_${id}` },
      bounce: { bounceType: "Permanent", bounceSubType: fixtureSecret, bouncedRecipients: [{ emailAddress: "recipient@example.test", diagnosticCode: fixtureSecret }] } });
    assert.ok(!JSON.stringify(await row(id)).includes(fixtureSecret));
    const evidence = await db.select().from(auditEntries).where(eq(auditEntries.messageId, id));
    assert.ok(!JSON.stringify(evidence).includes(fixtureSecret));
  });

  it("rejects a revoked key before touching content storage", async () => {
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.keyHash, hashApiKey(clientKey)));
    try { assert.equal((await post(payload(), undefined, clientKey)).statusCode, 401); }
    finally { await db.update(apiKeys).set({ revokedAt: null }).where(eq(apiKeys.keyHash, hashApiKey(clientKey))); }
  });

  it("blocks suppression added after enqueue, and never falls through to mock delivery", async () => {
    const body = { ...payload(), to: "later-suppressed@example.test" };
    const id = await accepted(body);
    await db.insert(suppressions).values({ id: `sup_${suffix}`, workspaceId: ws, email: body.to, reason: "bounce", source: "fixture" });
    let sends = 0;
    await processSend({ messageId: id, workspaceId: ws }, async () => { sends++; return { provider: "ses", providerMessageId: "fake" }; });
    assert.equal(sends, 0);
    assert.equal((await row(id)).status, "suppressed");
    assert.equal((await post({ ...payload(), to: body.to })).statusCode, 409);
    const simulated = await accepted({ ...payload(), to: "mock-refused@example.test" });
    await processSend({ messageId: simulated, workspaceId: ws }); // MAIL_PROVIDER=mock: must NOT invoke MockProvider
    assert.equal((await row(simulated)).status, "failed");
    assert.equal((await row(simulated)).provider, null);
  });

  it("honors the worker kill switch and does not route around a suspended org", async () => {
    const disabled = await accepted({ ...payload(), to: "disabled@example.test" });
    let sends = 0;
    const fake = async () => { sends++; return { provider: "ses", providerMessageId: "fake" }; };
    env.AUTH_MESSAGES_ENABLED = false;
    try { await processSend({ messageId: disabled, workspaceId: ws }, fake); }
    finally { env.AUTH_MESSAGES_ENABLED = true; }
    assert.equal((await row(disabled)).error, "auth_unavailable");
    const suspended = await accepted({ ...payload(), to: "suspended@example.test" });
    await db.update(organizations).set({ sendingSuspended: true }).where(eq(organizations.id, org));
    try { await processSend({ messageId: suspended, workspaceId: ws }, fake); }
    finally { await db.update(organizations).set({ sendingSuspended: false }).where(eq(organizations.id, org)); }
    assert.equal((await row(suspended)).status, "failed");
    assert.equal(sends, 0);
  });

  it("capability preflight exposes authenticated scope and refuses mock delivery claims", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/auth-messages/capabilities", headers: headers(tenantA) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { policy: "authentication-v1", workspace_id: ws, sub_tenant_id: tenantA, provider: "mock" });
    env.AUTH_MESSAGES_ENABLED = false;
    try {
      assert.equal((await app.inject({ method: "GET", url: "/v1/auth-messages/capabilities", headers: headers() })).statusCode, 503);
    } finally { env.AUTH_MESSAGES_ENABLED = true; }
  });

  it("Postgres ledger survives concurrent retries/restarts and the hook traverses the real API/worker with fake delivery", async () => {
    // This is the customer's optional hook-host schema, installed ONLY in this local test DB.
    await sql.unsafe(await readFile(new URL("../../../../packages/supabase/examples/ledger.sql", import.meta.url), "utf8"));
    const eventKeys = new Set<string>();
    const query = async (text: string, values: readonly string[]) => {
      eventKeys.add(values[0]);
      return sql.unsafe(text, [...values]);
    };
    const ledger = createPostgresHookLedger(query);
    try {
      const eventKey = randomBytes(32).toString("hex");
      const fingerprint = randomBytes(32).toString("hex");
      const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => ledger.claim({ eventKey, fingerprint,
        expiresAt: new Date(Date.now() + 100_000 + i * 1000).toISOString() })));
      assert.ok(claims.every(row => row.expiresAt === claims[0].expiresAt));
      assert.deepEqual(await createPostgresHookLedger(query).claim({ eventKey, fingerprint: "f".repeat(64),
        expiresAt: new Date(Date.now() + 200_000).toISOString() }), claims[0]);
      const hookKey = Buffer.alloc(32, 13);
      const config = { hookSecrets: [`whsec_${hookKey.toString("base64")}`], supabaseUrl: "https://project.example.test",
        workspaceId: ws, clientId: null, from: `no-reply@${env.ROOTMAIL_DOMAIN}`, brand: "Fixture",
        emailChangeMode: "secure" as const, allowedRedirects: ["fixtureapp://auth/callback"], defaultRedirect: "fixtureapp://auth/callback",
        rootmailUrl: "https://api.example.test", rootmailApiKey: key, ledgerKey: Buffer.alloc(32, 14).toString("base64"),
        credentialLifetimeSeconds: 600, ledger, budgetMs: 4000 };
      let calls = 0;
      const bridge: typeof fetch = async (url, opts) => {
        const target = new URL(String(url));
        const response = await app.inject({ method: opts?.method === "POST" ? "POST" : "GET", url: target.pathname,
          headers: opts?.headers as Record<string, string>, ...(opts?.body ? { payload: String(opts.body) } : {}) });
        const body = response.json();
        if (target.pathname.endsWith("capabilities") && response.statusCode === 200) {
          body.provider = "ses"; // Synthetic capability ONLY: real local worker still uses injected fake delivery.
        }
        if (opts?.method === "POST" && response.statusCode < 300) {
          ids.push(body.id);
          await processSend({ messageId: body.id, workspaceId: ws }, async () => {
            calls++; return { provider: "ses", providerMessageId: `fake_hook_${calls}` };
          });
        }
        return Response.json(body, { status: response.statusCode });
      };
      const signed = (seconds: number) => {
        const body = JSON.stringify({ user: { email: "hook-current@example.test", new_email: "hook-next@example.test" },
          email_data: { email_action_type: "email_change", token: "123456", token_hash: "fixture-hash", token_new: "654321", token_hash_new: "fixture-other-hash" } });
        const id = `hook_${suffix}`;
        return new Request("https://hook.example.test", { method: "POST", headers: { "content-type": "application/json",
          "webhook-id": id, "webhook-timestamp": String(seconds),
          "webhook-signature": `v1,${createHmac("sha256", hookKey).update(`${id}.${seconds}.${body}`).digest("base64")}` }, body });
      };
      const now = Math.floor(Date.now() / 1000);
      assert.equal((await createSupabaseEmailHook(config, { fetch: bridge })(signed(now - 10))).status, 200);
      assert.equal(calls, 2);
      assert.equal((await createSupabaseEmailHook({ ...config, ledger: createPostgresHookLedger(query) }, { fetch: bridge })(signed(now))).status, 200);
      assert.equal(calls, 2);
      const persisted = await sql`select * from rootmail_auth_hook.events where event_key in ${sql([...eventKeys])}`;
      assert.ok(!JSON.stringify(persisted).includes("123456"));
      assert.ok(!JSON.stringify(persisted).includes("@example.test"));
    } finally {
      if (eventKeys.size) await sql`delete from rootmail_auth_hook.events where event_key in ${sql([...eventKeys])}`;
    }
  });

  it("reconciliation expires queued work, labels stale claims unknown, and never resends or rewrites sent evidence", async () => {
    const queued = await accepted({ ...payload(), to: "reconcile-queued@example.test" });
    const claimed = await accepted({ ...payload(), to: "reconcile-sending@example.test" });
    const sent = await accepted({ ...payload(), to: "reconcile-sent@example.test" });
    await processSend({ messageId: sent, workspaceId: ws }, async () => ({ provider: "ses", providerMessageId: "fake_reconcile" }));
    await db.update(messages).set({ authExpiresAt: new Date(Date.now() - 120_000) }).where(inArray(messages.id, [queued, claimed, sent]));
    await db.update(messages).set({ status: "sending" }).where(eq(messages.id, claimed));
    await reconcileAuthMessages();
    assert.equal((await row(queued)).error, "auth_expired");
    assert.equal((await row(claimed)).error, "auth_send_outcome_unknown");
    assert.equal((await row(sent)).status, "sent");
    const audits = await db.select().from(auditEntries).where(and(eq(auditEntries.messageId, claimed), eq(auditEntries.event, "failed")));
    await reconcileAuthMessages();
    assert.equal(audits.length, 1);
    assert.equal((await db.select().from(auditEntries).where(and(eq(auditEntries.messageId, claimed), eq(auditEntries.event, "failed")))).length, 1);
    let attempts = 0;
    await processSend({ messageId: claimed, workspaceId: ws }, async () => { attempts++; throw new Error("must not resend"); });
    assert.equal(attempts, 0);
  });
});
