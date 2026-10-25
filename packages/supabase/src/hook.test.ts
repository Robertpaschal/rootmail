import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createSupabaseEmailHook, type SupabaseHookConfig, type HookLedger } from "./index";

const secret = Buffer.alloc(32, 11);
const fixture = (action = "signup") => ({ user: { email: "one@example.test", new_email: "two@example.test" },
  email_data: { email_action_type: action, token: "123456", token_hash: "fixture-hash",
    ...(action === "email_change" ? { token_new: "654321", token_hash_new: "other-fixture-hash" } : {}) } });
function request(payload = fixture(), id = "evt_fixture", seconds = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(payload);
  return new Request("https://hook.example.test", { method: "POST", headers: { "content-type": "application/json",
    "webhook-id": id, "webhook-timestamp": String(seconds),
    "webhook-signature": `v1,${createHmac("sha256", secret).update(`${id}.${seconds}.${raw}`).digest("base64")}` }, body: raw });
}
function setup() {
  const entries = new Map<string, { fingerprint: string; expiresAt: string }>();
  const ledger: HookLedger = { async claim(input) {
    if (!entries.has(input.eventKey)) entries.set(input.eventKey, { fingerprint: input.fingerprint, expiresAt: input.expiresAt });
    return entries.get(input.eventKey)!;
  } };
  const config: SupabaseHookConfig = { hookSecrets: [`whsec_${secret.toString("base64")}`],
    supabaseUrl: "https://project.example.test", workspaceId: "ws_test", clientId: "tnt_test",
    from: "auth@example.test", brand: "Example", emailChangeMode: "secure",
    allowedRedirects: ["exampleapp://auth/callback"], defaultRedirect: "exampleapp://auth/callback",
    rootmailUrl: "https://api.example.test", rootmailApiKey: "rm_live_fixture_only",
    credentialLifetimeSeconds: 600, ledgerKey: Buffer.alloc(32, 12).toString("base64"), ledger, budgetMs: 500 };
  const rows = new Map<string, Record<string, unknown>>();
  const posts: Record<string, unknown>[] = [];
  let sends = 0;
  const fakeFetch: typeof fetch = async (url, options) => {
    assert.equal(options?.redirect, "error");
    assert.equal((options?.headers as Record<string, string>)["x-rootmail-subtenant"], "tnt_test");
    const path = new URL(String(url)).pathname;
    if (path.endsWith("capabilities")) return Response.json({ policy: "authentication-v1", provider: "ses", workspace_id: "ws_test", sub_tenant_id: "tnt_test" });
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body)); posts.push(body);
      if (!rows.has(body.idempotency_key)) {
        sends++;
        rows.set(body.idempotency_key, { id: `msg_fixture${sends}`, content_policy: body.policy,
          workspace_id: "ws_test", sub_tenant_id: "tnt_test", expires_at: body.expires_at, to: body.to,
          sandbox: false, test_recipient: null, status: "sent", provider: "ses", provider_message_id: `fake_${sends}` });
      }
      return Response.json(rows.get(body.idempotency_key));
    }
    return Response.json([...rows.values()].find(row => path.endsWith(String(row.id))));
  };
  return { config, entries, rows, posts, fakeFetch, sends: () => sends };
}

test("hook verifies before any external work and never echoes secrets", async () => {
  const f = setup(); let calls = 0;
  const hook = createSupabaseEmailHook(f.config, { fetch: async () => { calls++; throw Error("secret-code"); } });
  const req = request(); req.headers.set("webhook-signature", "v1,invalid");
  const response = await hook(req);
  assert.equal(response.status, 401); assert.equal(calls, 0); assert.equal(f.entries.size, 0);
  assert.ok(!(await response.text()).includes("123456"));
});

test("re-signed retry and restarted hook preserve original expiry and recipient IDs", async () => {
  const f = setup();
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await createSupabaseEmailHook(f.config, { fetch: f.fakeFetch })(request(fixture(), "evt", now - 20))).status, 200);
  assert.equal((await createSupabaseEmailHook(f.config, { fetch: f.fakeFetch })(request(fixture(), "evt", now))).status, 200);
  assert.equal(f.sends(), 1);
  assert.equal(f.posts[0].expires_at, f.posts[1].expires_at);
  assert.equal(f.posts[0].idempotency_key, f.posts[1].idempotency_key);
  assert.ok(!JSON.stringify([...f.entries]).includes("123456"));
  const changed = fixture(); changed.email_data.token = "999999";
  assert.equal((await createSupabaseEmailHook(f.config, { fetch: f.fakeFetch })(request(changed, "evt"))).status, 409);
  assert.equal(f.posts.length, 2);
});

test("partial two-recipient completion retries the missing recipient without resending the first", async () => {
  const f = setup(); let failSecond = true;
  const fetcher: typeof fetch = async (url, opts) => {
    if (opts?.method === "POST" && JSON.parse(String(opts.body)).to === "two@example.test" && failSecond) return new Response("private-provider-error", { status: 503 });
    return f.fakeFetch(url, opts);
  };
  const hook = createSupabaseEmailHook(f.config, { fetch: fetcher });
  assert.equal((await hook(request(fixture("email_change")))).status, 503);
  assert.equal(f.sends(), 1);
  failSecond = false;
  assert.equal((await hook(request(fixture("email_change")))).status, 200);
  assert.equal(f.sends(), 2);
  assert.equal(f.entries.size, 1);
});

test("ambiguous POST response is recovered only by the same idempotent request", async () => {
  const f = setup(); let drop = true;
  const hook = createSupabaseEmailHook(f.config, { fetch: async (url, opts) => {
    const response = await f.fakeFetch(url, opts);
    if (opts?.method === "POST" && drop) { drop = false; throw Error("secret-provider-response"); }
    return response;
  } });
  assert.equal((await hook(request())).status, 503);
  assert.equal((await hook(request())).status, 200);
  assert.equal(f.sends(), 1);
});

test("expired ledger tombstones cannot be renewed by a newly signed retry", async () => {
  const f = setup();
  f.config.ledger = { async claim(input) { return { fingerprint: input.fingerprint, expiresAt: new Date(Date.now() - 1).toISOString() }; } };
  assert.equal((await createSupabaseEmailHook(f.config, { fetch: f.fakeFetch })(request())).status, 422);
  assert.equal(f.posts.length, 0);
});

test("unsupported server, wrong scope and mock capability are refused before secrets are posted", async () => {
  for (const capability of [null, { policy: "authentication-v1", provider: "mock", workspace_id: "ws_test", sub_tenant_id: "tnt_test" },
    { policy: "authentication-v1", provider: "ses", workspace_id: "ws_other", sub_tenant_id: "tnt_test" }]) {
    const f = setup(); let calls = 0;
    const hook = createSupabaseEmailHook(f.config, { fetch: async (_url, opts) => {
      calls++; assert.equal(opts?.method, "GET"); return capability ? Response.json(capability) : new Response("", { status: 404 });
    } });
    assert.equal((await hook(request())).status, 503); assert.equal(calls, 1); assert.equal(f.entries.size, 0);
  }
});

test("one total deadline bounds stalled response, ledger and upload streams", async () => {
  for (const stalled of ["fetch", "ledger", "upload", "response"]) {
    const f = setup(); f.config.budgetMs = 50;
    if (stalled === "ledger") f.config.ledger = { claim: () => new Promise(() => {}) };
    const hook = createSupabaseEmailHook(f.config, { fetch: stalled === "fetch" ? () => new Promise(() => {})
      : stalled === "response" ? async () => new Response(new ReadableStream({ start() {} })) : f.fakeFetch });
    const req = stalled === "upload" ? new Request("https://hook.example.test", { method: "POST", headers: { "content-type": "application/json" },
      body: new ReadableStream({ start() {} }), duplex: "half" } as RequestInit) : request();
    const started = Date.now();
    assert.equal((await hook(req)).status, 503);
    assert.ok(Date.now() - started < 1000);
    assert.equal(f.posts.length, 0);
  }
});

test("queued is not success; polling requires real provider acceptance", async () => {
  for (const state of ["sent", "queued", "failed", "suppressed", "mock", "wrong-scope"]) {
    const f = setup(); f.config.budgetMs = 160;
    const hook = createSupabaseEmailHook(f.config, { fetch: async (url, opts) => {
      const response = await f.fakeFetch(url, opts);
      if (String(url).endsWith("capabilities")) return response;
      const row = await response.json();
      if (opts?.method === "POST") row.status = "queued";
      else {
        row.status = ["mock", "wrong-scope"].includes(state) ? "sent" : state;
        if (state === "mock") row.provider = "mock";
        if (state === "wrong-scope") row.sub_tenant_id = "tnt_other";
      }
      return Response.json(row);
    } });
    const response = await hook(request());
    assert.equal(response.status === 200, state === "sent", state);
  }
});

test("rejects method, oversized streams, bad content type and malformed configuration", async () => {
  const f = setup(); const hook = createSupabaseEmailHook(f.config, { fetch: f.fakeFetch });
  assert.equal((await hook(new Request("https://hook.example.test"))).status, 405);
  assert.equal((await hook(new Request("https://hook.example.test", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await hook(new Request("https://hook.example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "a".repeat(128 * 1024 + 1) }))).status, 413);
  for (const patch of [{ rootmailUrl: "http://example.test" }, { rootmailUrl: "https://user:secret@example.test" }, { budgetMs: 5000 }, { credentialLifetimeSeconds: 10 }, { rootmailApiKey: "rm_test_fixture" }]) {
    assert.throws(() => createSupabaseEmailHook({ ...f.config, ...patch }), /invalid_configuration/);
  }
});

test("revocation, suppression, quota and rate failures remain safe errors with no adapter POST retries", async () => {
  for (const status of [401, 402, 403, 409, 422, 429, 500]) {
    const f = setup(); let posts = 0;
    const hook = createSupabaseEmailHook(f.config, { fetch: async (url, opts) => {
      if (opts?.method !== "POST") return f.fakeFetch(url, opts);
      posts++; return new Response("echoed-secret-123456", { status });
    } });
    const result = await hook(request());
    assert.equal(result.status, status === 500 ? 503 : status);
    assert.ok(!(await result.text()).includes("123456"));
    assert.equal(posts, 1);
  }
});

test("pre-aborted requests and oversized upstream responses fail closed", async () => {
  const f = setup(); let calls = 0;
  const hook = createSupabaseEmailHook(f.config, { fetch: async () => {
    calls++; return new Response("x".repeat(64 * 1024 + 1));
  } });
  const controller = new AbortController(); controller.abort();
  const aborted = new Request(request(), { signal: controller.signal });
  assert.equal((await hook(aborted)).status, 503); assert.equal(calls, 0);
  assert.notEqual((await hook(request())).status, 200); assert.equal(calls, 1);
  assert.equal(f.entries.size, 0);
});
