import assert from "node:assert/strict";
import { test } from "node:test";
import type { Redis } from "ioredis";
import { AuthContentError, AuthContentVault, assertAuthLifetime, authRequestFingerprint, openAuthContent, sealAuthContent } from "./auth-content";

const key = Buffer.alloc(32, 21).toString("base64");
const content = { html: "<p>fixture-secret-123456</p>", text: "fixture-secret-123456" };
const scope = () => ({ id: "msg_fixture", workspaceId: "ws_fixture", subTenantId: "st_fixture", authExpiresAt: new Date(Date.now() + 60_000) });
const safeError = (code: string) => (e: unknown) => e instanceof AuthContentError && e.message === code && e.cause === undefined;

test("auth content is randomized authenticated ciphertext, never a plaintext or bare-code digest", () => {
  const s = scope();
  const first = sealAuthContent(content, s, key);
  assert.notEqual(first, sealAuthContent(content, s, key));
  assert.ok(!first.includes(content.text));
  assert.deepEqual(openAuthContent(first, s, key), content);
  assert.notEqual(authRequestFingerprint(content, key), authRequestFingerprint(content, Buffer.alloc(32, 22).toString("base64")));
});

test("ciphertext cannot move to a different message, workspace, client or deadline", () => {
  const s = scope();
  const sealed = sealAuthContent(content, s, key);
  for (const patch of [{ id: "msg_other" }, { workspaceId: "ws_other" }, { subTenantId: null }, { authExpiresAt: new Date(s.authExpiresAt.getTime() + 1) }]) {
    assert.throws(() => openAuthContent(sealed, { ...s, ...patch }, key), safeError("auth_content_unavailable"));
  }
  assert.throws(() => openAuthContent(sealed, s, Buffer.alloc(32, 3).toString("base64")), safeError("auth_content_unavailable"));
  assert.throws(() => openAuthContent("secret-123456", s, key), safeError("auth_content_unavailable"));
});

test("expiry checks reject stale, near-expiry, invalid and overlong deadlines", () => {
  const now = Date.now();
  for (const value of [now - 1, now + 15_000, now + 3_600_001, NaN]) {
    assert.throws(() => assertAuthLifetime(new Date(value), now), safeError("auth_expired"));
  }
  assertAuthLifetime(new Date(now + 15_001), now);
});

test("vault rejects persistent, replicated, evicting or uninspectable stores", async () => {
  for (const variant of ["save", "appendonly", "maxmemory-policy", "unbounded", "replica", "denied"]) {
    const redis = {
      config: async () => {
        if (variant === "denied") throw new Error(content.text);
        return ["save", variant === "save" ? "3600 1" : "", "appendonly", variant === "appendonly" ? "yes" : "no",
          "maxmemory-policy", variant === "maxmemory-policy" ? "allkeys-lru" : "noeviction", "maxmemory", variant === "unbounded" ? "0" : "67108864"];
      },
      role: async () => ["master", 0, variant === "replica" ? ["replica"] : []],
    } as unknown as Redis;
    await assert.rejects(new AuthContentVault(redis, key).assertEphemeral(), safeError("auth_unavailable"));
  }
});

test("vault stores only ciphertext with absolute NX expiry and consumes exactly once", async () => {
  let stored: string | null = null;
  let args: unknown[] = [];
  const redis = {
    config: async () => ["save", "", "appendonly", "no", "maxmemory-policy", "noeviction", "maxmemory", "67108864"],
    role: async () => ["master", 0, []],
    set: async (...values: unknown[]) => { args = values; if (stored) return null; stored = values[1] as string; return "OK"; },
    getdel: async () => { const value = stored; stored = null; return value; },
    del: async () => { stored = null; return 1; },
  } as unknown as Redis;
  const vault = new AuthContentVault(redis, key);
  const s = scope();
  await vault.put(s, content);
  assert.deepEqual(args.slice(2), ["PXAT", s.authExpiresAt.getTime(), "NX"]);
  assert.ok(!JSON.stringify(args).includes(content.text));
  await assert.rejects(vault.put(s, content), safeError("auth_content_unavailable"));
  assert.deepEqual(await vault.take(s), content);
  await assert.rejects(vault.take(s), safeError("auth_content_unavailable"));
});

test("bad content and weak/malformed encryption keys never leak in errors", () => {
  assert.throws(() => sealAuthContent({ html: "", text: content.text }, scope(), key), safeError("auth_content_invalid"));
  assert.throws(() => sealAuthContent(content, scope(), "fixture-secret-123456"), safeError("auth_unavailable"));
});
