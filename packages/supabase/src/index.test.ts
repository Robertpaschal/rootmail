import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { test } from "node:test";
import { createSupabaseEmailPlanner, SupabaseHookError, type HookErrorCode, type SupabaseEmailConfig } from "./index";

// Synthetic fixtures only. This package has no mail/network/DB dependency.
const key = Buffer.alloc(32, 7);
const previousKey = Buffer.alloc(32, 8);
const secret = `v1,whsec_${key.toString("base64")}`;
const config: SupabaseEmailConfig & { allowedRedirects: string[]; defaultRedirect: string } = {
  hookSecrets: [secret], supabaseUrl: "https://project.example.com",
  workspaceId: "ws_fixture", clientId: "st_fixture", from: "auth@example.com",
  brand: "Example App", emailChangeMode: "secure",
  allowedRedirects: ["https://app.example.com/callback", "exampleapp://auth/callback"],
  defaultRedirect: "https://app.example.com/callback",
};
const fixture = () => ({
  user: { email: "current@example.com", new_email: "next@example.com" },
  email_data: {
    email_action_type: "signup", token: "123456", token_hash: "fixture-hash-current",
    token_new: "", token_hash_new: "", redirect_to: config.defaultRedirect,
    site_url: "https://untrusted.example.org",
  },
});
function signed(raw: string, options: { id?: string; seconds?: number; signingKey?: Buffer } = {}) {
  const id = options.id ?? "evt_fixture";
  const seconds = options.seconds ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", options.signingKey ?? key)
    .update(`${id}.${seconds}.${raw}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(seconds), "webhook-signature": `v1,${signature}` };
}
const plan = createSupabaseEmailPlanner(config);
function prepare(payload = fixture(), settings = config, eventId?: string) {
  const raw = JSON.stringify(payload);
  return createSupabaseEmailPlanner(settings)(raw, signed(raw, { id: eventId }));
}
function fails(code: HookErrorCode, fn: () => unknown) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof SupabaseHookError);
    assert.equal(error.code, code);
    assert.equal(error.message, `Supabase email hook: ${code}`);
    assert.equal(error.cause, undefined);
    return true;
  });
}

for (const action of ["signup", "magiclink", "recovery", "invite", "reauthentication"]) {
  test(`prepares ${action} without claiming a send`, () => {
    const payload = fixture();
    payload.email_data.email_action_type = action;
    if (action === "reauthentication") payload.email_data.token_hash = "";
    const result = prepare(payload);
    assert.equal(result.action, action);
    assert.equal(result.messages.length, 1);
    assert.equal("status" in result, false);
    const message = result.messages[0].readSensitiveContent();
    assert.equal(message.to, payload.user.email);
    assert.ok(message.text.includes(payload.email_data.token));
    if (action === "reauthentication") {
      assert.equal(message.verificationUrl, null);
      assert.ok(!message.html.includes("href="));
    } else {
      const url = new URL(message.verificationUrl!);
      assert.equal(url.origin, config.supabaseUrl);
      assert.equal(url.pathname, "/auth/v1/verify");
      assert.equal(url.searchParams.get("type"), action);
      assert.equal(url.searchParams.get("token"), payload.email_data.token_hash);
      assert.equal(url.searchParams.get("redirect_to"), config.defaultRedirect);
    }
  });
}

test("verifies exact raw bytes before parsing", () => {
  const raw = JSON.stringify(fixture(), null, 2);
  assert.equal(plan(raw, signed(raw)).messages.length, 1);
  fails("invalid_signature", () => plan(JSON.stringify(fixture()), signed(raw)));
  fails("invalid_signature", () => plan("invalid-json-with-secret", signed(raw)));
  fails("invalid_payload", () => plan("invalid-json-with-secret", signed("invalid-json-with-secret")));
});

for (const offset of [-601, 601]) {
  test(`rejects correctly signed timestamp offset ${offset}`, () => {
    const raw = JSON.stringify(fixture());
    fails("invalid_signature", () => plan(raw, signed(raw, { seconds: Math.floor(Date.now() / 1000) + offset })));
  });
}

test("rejects missing, malformed, combined and duplicate signature headers", () => {
  const raw = JSON.stringify(fixture());
  for (const name of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
    fails("invalid_signature", () => plan(raw, { ...signed(raw), [name]: "" }));
  }
  const valid = signed(raw);
  for (const timestamp of [valid["webhook-timestamp"] + "junk", "NaN", "1", valid["webhook-timestamp"] + ", 1"]) {
    fails("invalid_signature", () => plan(raw, { ...valid, "webhook-timestamp": timestamp }));
  }
  fails("invalid_signature", () => plan(raw, { ...valid, "Webhook-Id": "different" }));
  fails("invalid_signature", () => plan(raw, { ...valid, "webhook-id": "first, second" }));
  fails("invalid_signature", () => plan(raw, { ...valid, "webhook-signature": "x".repeat(4097) }));
});

test("accepts case-insensitive Headers and multiple signatures", () => {
  const raw = JSON.stringify(fixture());
  const headers = new Headers();
  for (const [name, value] of Object.entries(signed(raw))) headers.set(name.toUpperCase(), value);
  headers.set("webhook-signature", `v1,invalid ${headers.get("webhook-signature")}`);
  assert.equal(plan(raw, headers).messages.length, 1);
});

test("key rotation overlap works and removed keys stop verifying", () => {
  const raw = JSON.stringify(fixture());
  const oldHeaders = signed(raw, { signingKey: previousKey });
  const rotating = createSupabaseEmailPlanner({ ...config, hookSecrets: [secret, `whsec_${previousKey.toString("base64")}`] });
  assert.equal(rotating(raw, oldHeaders).messages.length, 1);
  assert.equal(rotating(raw, signed(raw)).messages.length, 1);
  fails("invalid_signature", () => plan(raw, oldHeaders));
});

test("rejects unsupported and malformed signed payloads with fixed safe errors", () => {
  for (const bad of [null, {}, { user: fixture().user }, { ...fixture(), user: { email: "not-email" } }]) {
    const raw = JSON.stringify(bad);
    fails("invalid_payload", () => plan(raw, signed(raw)));
  }
  const unsupported = fixture();
  unsupported.email_data.email_action_type = "password_changed_notification";
  fails("unsupported_action", () => prepare(unsupported));
  const missing = fixture();
  missing.email_data.token_hash = "";
  fails("invalid_payload", () => prepare(missing));
  const injected = fixture();
  injected.email_data.token = "123456<script>";
  fails("invalid_payload", () => prepare(injected));
});

test("bounds raw payload size", () => {
  const raw = "x".repeat(128 * 1024 + 1);
  fails("invalid_payload", () => plan(raw, signed(raw)));
});

function emailChange() {
  const payload = fixture();
  payload.email_data.email_action_type = "email_change";
  payload.email_data.token_new = "654321";
  payload.email_data.token_hash_new = "fixture-hash-old-address";
  payload.email_data.token_hash = "fixture-hash-new-address";
  return payload;
}

test("secure email change maps both codes and reversed hash fields to the right recipients", () => {
  const payload = emailChange();
  const result = prepare(payload);
  assert.equal(result.messages.length, 2);
  const [current, next] = result.messages.map((message) => message.readSensitiveContent());
  assert.equal(current.to, payload.user.email);
  assert.equal(next.to, payload.user.new_email);
  assert.ok(current.text.includes("123456"));
  assert.ok(!current.text.includes("654321"));
  assert.ok(next.text.includes("654321"));
  assert.ok(!next.text.includes("123456"));
  assert.equal(new URL(current.verificationUrl!).searchParams.get("token"), payload.email_data.token_hash_new);
  assert.equal(new URL(next.verificationUrl!).searchParams.get("token"), payload.email_data.token_hash);
  assert.notEqual(result.messages[0].idempotencyKey, result.messages[1].idempotencyKey);
});

for (const field of ["token", "token_new", "token_hash", "token_hash_new"] as const) {
  test(`secure mode rejects missing ${field} instead of sending half a plan`, () => {
    const payload = emailChange();
    payload.email_data[field] = "";
    fails("invalid_payload", () => prepare(payload));
  });
}

for (const tokenField of ["token", "token_new"] as const) {
  test(`single email change accepts only ${tokenField}, sends only to new address`, () => {
    const payload = emailChange();
    payload.email_data.token_hash_new = "";
    payload.email_data[tokenField === "token" ? "token_new" : "token"] = "";
    const result = prepare(payload, { ...config, emailChangeMode: "single" });
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].readSensitiveContent().to, payload.user.new_email);
    assert.equal(new URL(result.messages[0].readSensitiveContent().verificationUrl!).searchParams.get("token"), payload.email_data.token_hash);
  });
}

test("email change rejects ambiguous mode/payload, missing/new-identical address", () => {
  fails("invalid_payload", () => prepare(emailChange(), { ...config, emailChangeMode: "single" }));
  const payload = emailChange();
  payload.email_data.token_hash_new = "";
  fails("invalid_payload", () => prepare(payload, { ...config, emailChangeMode: "single" }));
  for (const address of ["", "not-email", "CURRENT@example.com"]) {
    const bad = emailChange();
    bad.user.new_email = address;
    fails("invalid_payload", () => prepare(bad));
  }
  const unexpected = fixture();
  unexpected.email_data.token_new = "654321";
  fails("invalid_payload", () => prepare(unexpected));
});

test("recipient idempotency keys are stable across redelivery and re-signing", () => {
  const payload = emailChange();
  const raw = JSON.stringify(payload);
  const first = plan(raw, signed(raw));
  const retry = plan(raw, signed(raw, { seconds: Math.floor(Date.now() / 1000) - 1 }));
  assert.deepEqual(first.messages.map((m) => m.idempotencyKey), retry.messages.map((m) => m.idempotencyKey));
  assert.notEqual(first.messages[0].idempotencyKey, prepare(payload, config, "evt_resend").messages[0].idempotencyKey);
  // The second recipient retains its key when retried after a first-recipient success.
  assert.equal(first.messages[1].idempotencyKey, prepare(payload).messages[1].idempotencyKey);
});

test("scope comes only from server config, and isolates idempotency namespaces", () => {
  const payload = { ...fixture(), workspaceId: "attacker", clientId: "attacker", from: "attacker@example.com" };
  const first = prepare(payload);
  assert.equal(first.workspaceId, config.workspaceId);
  assert.equal(first.clientId, config.clientId);
  assert.equal(first.from, config.from);
  for (const patch of [{ workspaceId: "ws_other" }, { clientId: "st_other" }, { clientId: null }, { supabaseUrl: "https://other.example.com" }]) {
    assert.notEqual(first.messages[0].idempotencyKey, prepare(payload, { ...config, ...patch }).messages[0].idempotencyKey);
  }
});

test("redirect allowlist is exact, supports explicit native URLs, never trusts site_url", () => {
  const payload = fixture();
  for (const redirect of ["https://attacker.example.com", `${config.defaultRedirect}?next=attacker`, "javascript:alert(1)"]) {
    payload.email_data.redirect_to = redirect;
    fails("invalid_redirect", () => prepare(payload));
  }
  payload.email_data.redirect_to = "exampleapp://auth/callback";
  assert.equal(new URL(prepare(payload).messages[0].readSensitiveContent().verificationUrl!).searchParams.get("redirect_to"), payload.email_data.redirect_to);
  payload.email_data.redirect_to = "";
  assert.equal(new URL(prepare(payload).messages[0].readSensitiveContent().verificationUrl!).searchParams.get("redirect_to"), config.defaultRedirect);
});

test("HTML escapes branding and URLs; default inspection redacts all auth content", () => {
  const result = prepare(fixture(), { ...config, brand: "Example <App> & 'Friends'" });
  const message = result.messages[0];
  assert.ok(message.readSensitiveContent().html.includes("Example &lt;App&gt; &amp; &#39;Friends&#39;"));
  assert.ok(!message.readSensitiveContent().html.includes("<App>"));
  for (const serialized of [JSON.stringify(result), inspect(result), String(message)]) {
    for (const sensitive of ["123456", "fixture-hash-current", "current@example.com", "/auth/v1/verify", "<p>"]) {
      assert.ok(!serialized.includes(sensitive));
    }
    assert.ok(serialized.includes("REDACTED"));
  }
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.messages));
  assert.ok(Object.isFrozen(message.readSensitiveContent()));
});

test("rejects unsafe configuration without reflecting secrets or URLs", () => {
  for (const patch of [
    { hookSecrets: [] }, { hookSecrets: ["sensitive-secret"] }, { hookSecrets: ["whsec_YQ=="] },
    { brand: "Example\nBcc:attacker@example.com" },
    { supabaseUrl: "http://project.example.com" }, { supabaseUrl: "https://user:pass@project.example.com" },
    { supabaseUrl: "https://project.example.com/extra" }, { supabaseUrl: "https://project.example.com?secret=value" },
    { defaultRedirect: "https://not-allowlisted.example.com" }, { allowedRedirects: ["javascript:alert(1)", config.defaultRedirect] },
  ]) fails("invalid_configuration", () => createSupabaseEmailPlanner({ ...config, ...patch }));
});

test("configuration is captured independently from later caller mutations", () => {
  const local = { ...config, allowedRedirects: [...config.allowedRedirects], hookSecrets: [...config.hookSecrets] };
  const planner = createSupabaseEmailPlanner(local);
  local.allowedRedirects.push("https://attacker.example.com");
  local.workspaceId = "ws_changed";
  const payload = fixture();
  payload.email_data.redirect_to = "https://attacker.example.com";
  const raw = JSON.stringify(payload);
  fails("invalid_redirect", () => planner(raw, signed(raw)));
  assert.equal(planner(JSON.stringify(fixture()), signed(JSON.stringify(fixture()))).workspaceId, config.workspaceId);
});
