import assert from "node:assert/strict";
import { test } from "node:test";
import { authTrackingSafe, sendAuthWithTransport, type AuthSesTransport } from "./auth-ses";
import type { Message } from "@rootmail/db";

test("auth SES config must disable opens/clicks while retaining delivery/bounce/complaint", () => {
  const safe = { Enabled: true, MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"] };
  assert.equal(authTrackingSafe([safe]), true);
  assert.equal(authTrackingSafe(undefined), false);
  assert.equal(authTrackingSafe([]), false);
  assert.equal(authTrackingSafe([{ ...safe, Enabled: false }]), false);
  assert.equal(authTrackingSafe([{ Enabled: true, MatchingEventTypes: ["DELIVERY"] }]), false);
  for (const event of ["OPEN", "CLICK"]) {
    assert.equal(authTrackingSafe([safe, { Enabled: true, MatchingEventTypes: [event] }]), false);
    assert.equal(authTrackingSafe([safe, { MatchingEventTypes: [event] }]), false);
    assert.equal(authTrackingSafe([safe, { Enabled: false, MatchingEventTypes: [event] }]), true);
  }
});

const message = () => ({ authExpiresAt: new Date(Date.now() + 60_000), fromEmail: "auth@example.test", toEmail: "recipient@example.test", replyTo: null }) as Message;
const content = { html: '<a href="https://app.example.test?token=fixture-secret">Confirm</a>', text: "fixture-secret" };
const safeEvents = [{ Enabled: true, MatchingEventTypes: ["DELIVERY", "BOUNCE", "COMPLAINT"] }];

test("auth sender uses only the validated config set, generic subject and no-track links", async () => {
  let sends = 0;
  const transport: AuthSesTransport = {
    settings: async (set, signal) => { assert.equal(set, "auth-only"); assert.equal(signal.aborted, false); return safeEvents; },
    send: async (input, signal) => {
      sends++;
      assert.equal(signal.aborted, false);
      assert.equal(input.ConfigurationSetName, "auth-only");
      assert.equal(input.Content?.Simple?.Subject?.Data, "Authentication email");
      assert.ok(input.Content?.Simple?.Body?.Html?.Data?.includes("ses:no-track"));
      assert.equal(input.Content?.Simple?.Headers, undefined);
      return "fixture-provider-id";
    },
  };
  assert.deepEqual(await sendAuthWithTransport(message(), content, "auth-only", transport), { provider: "ses", providerMessageId: "fixture-provider-id" });
  assert.equal(sends, 1);
});

test("unsafe settings, expired-after-lookup and lookup failures never invoke send", async () => {
  for (const mode of ["tracking", "expired", "lookup-error"]) {
    const m = message();
    let sends = 0;
    await assert.rejects(sendAuthWithTransport(m, content, "auth-only", {
      settings: async () => {
        if (mode === "lookup-error") throw new Error(content.text);
        if (mode === "expired") m.authExpiresAt = new Date(Date.now() - 1);
        return mode === "tracking" ? [...safeEvents, { Enabled: true, MatchingEventTypes: ["OPEN"] }] : safeEvents;
      },
      send: async () => { sends++; return "fixture-id"; },
    }), { message: "auth_provider_outcome_unknown" });
    assert.equal(sends, 0);
  }
});

test("provider errors and missing IDs are redacted and never retried", async () => {
  for (const mode of ["failure", "missing-id"]) {
    let sends = 0;
    await assert.rejects(sendAuthWithTransport(message(), content, "auth-only", {
      settings: async () => safeEvents,
      send: async () => { sends++; if (mode === "failure") throw new Error(content.text); return undefined; },
    }), { message: "auth_provider_outcome_unknown" });
    assert.equal(sends, 1);
  }
});
