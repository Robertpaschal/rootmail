import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  byoEffective,
  byoFailureMessage,
  byoGloballyEnabled,
  byoWebhookUrl,
  decideProviderRoute,
  fromAllowedForByo,
  isRootmailOwnedDomain,
  snsTopicMatches,
} from "./byo";

describe("BYO flag", () => {
  it("is OFF unless the global switch is exactly \"true\"", () => {
    for (const v of [undefined, "", "false", "1", "TRUE", "yes", " true"]) assert.equal(byoGloballyEnabled(v), false, String(v));
    assert.equal(byoGloballyEnabled("true"), true);
  });
  it("needs BOTH the global switch and the org flag", () => {
    assert.equal(byoEffective(true, false), false);
    assert.equal(byoEffective(false, true), false);
    assert.equal(byoEffective(null, true), false);
    assert.equal(byoEffective(true, true), true);
  });
});

describe("decideProviderRoute — BYO-only kinds (SMTP)", () => {
  const route = (o: Partial<Parameters<typeof decideProviderRoute>[0]>) =>
    decideProviderRoute({ isInternal: false, flagged: false, connection: { status: "active" }, buildError: null, byoOnly: true, ...o });
  it("unflagged: fails closed — never used, never swapped for ours", () => {
    assert.equal(route({}).kind, "fail");
    assert.equal(route({ connection: { status: "pending" } }).kind, "fail");
    assert.equal(route({ buildError: "x" }).kind, "fail");
  });
  it("flagged: used when usable, loud when not", () => {
    assert.equal(route({ flagged: true }).kind, "own");
    assert.equal(route({ flagged: true, buildError: "x" }).kind, "fail");
  });
  it("platform mail and 'no connection' are unaffected", () => {
    assert.equal(route({ isInternal: true }).kind, "platform");
    assert.equal(route({ connection: null }).kind, "ours");
  });
});

describe("decideProviderRoute — characterization of today's behaviour when unflagged", () => {
  const route = (o: Partial<Parameters<typeof decideProviderRoute>[0]>) =>
    decideProviderRoute({ isInternal: false, flagged: false, connection: null, buildError: null, ...o });

  it("no connection → ours (flagged or not)", () => {
    assert.deepEqual(route({}), { kind: "ours" });
    assert.deepEqual(route({ flagged: true }), { kind: "ours" });
  });
  it("unflagged: active + buildable → own; anything else → ours, silently (unchanged)", () => {
    assert.deepEqual(route({ connection: { status: "active" } }), { kind: "own" });
    assert.deepEqual(route({ connection: { status: "pending" } }), { kind: "ours" });
    assert.deepEqual(route({ connection: { status: "failed" } }), { kind: "ours" });
    assert.deepEqual(route({ connection: { status: "active" }, buildError: "x" }), { kind: "ours" });
  });
  it("flagged: an unusable connection fails loudly, never falls back", () => {
    assert.equal(route({ flagged: true, connection: { status: "pending" } }).kind, "fail");
    const r = route({ flagged: true, connection: { status: "active" }, buildError: "bad creds" });
    assert.deepEqual(r, { kind: "fail", reason: "bad creds" });
    assert.deepEqual(route({ flagged: true, connection: { status: "active" } }), { kind: "own" });
    const waiting = route({ flagged: true, connection: { status: "awaiting_feedback" } });
    assert.equal(waiting.kind, "fail");
    assert.match((waiting as { reason: string }).reason, /SNS topic hasn't confirmed/);
    assert.deepEqual(route({ connection: { status: "awaiting_feedback" } }), { kind: "ours" }, "unflagged unchanged");
  });
  it("platform mail is ours explicitly, even if a connection row existed", () => {
    for (const flagged of [false, true]) {
      assert.deepEqual(route({ isInternal: true, flagged, connection: { status: "active" } }), { kind: "platform" });
    }
  });
});

describe("From-domain enforcement", () => {
  it("allows exact verified domains or addresses only", () => {
    assert.equal(fromAllowedForByo("hi@acme.com", ["acme.com"]), true);
    assert.equal(fromAllowedForByo("HI@ACME.COM", ["acme.com"]), true);
    assert.equal(fromAllowedForByo("hi@acme.com", ["hi@acme.com"]), true);
    assert.equal(fromAllowedForByo("hi@mail.acme.com", ["acme.com"]), false, "subdomains are not implied");
    assert.equal(fromAllowedForByo("hi@acme.com.evil.test", ["acme.com"]), false);
    assert.equal(fromAllowedForByo("hi@acme.com", []), false);
    assert.equal(fromAllowedForByo("hi@acme.com", null), false);
  });
  it("knows Rootmail's own domains", () => {
    assert.equal(isRootmailOwnedDomain("rootmail.io"), true);
    assert.equal(isRootmailOwnedDomain("reply.rootmail.io"), true);
    assert.equal(isRootmailOwnedDomain("beta+org@rootmail.io"), true);
    assert.equal(isRootmailOwnedDomain("inbound.example", ["inbound.example"]), true);
    assert.equal(isRootmailOwnedDomain("notrootmail.io"), false);
    assert.equal(isRootmailOwnedDomain("acme.com"), false);
  });
});

describe("webhooks", () => {
  it("SNS topic must match exactly", () => {
    const arn = "arn:aws:sns:us-east-1:123456789012:feedback";
    assert.equal(snsTopicMatches(arn, arn), true);
    assert.equal(snsTopicMatches(arn, `${arn}-other`), false);
    assert.equal(snsTopicMatches(null, arn), false);
    assert.equal(snsTopicMatches(arn, undefined), false);
  });
  it("builds the per-tenant URL", () => {
    assert.equal(byoWebhookUrl("https://api.rootmail.io/", "tok", "ses"), "https://api.rootmail.io/v1/webhooks/byo/tok/ses");
  });
  it("failure copy names the tenant's account and says nothing went through ours", () => {
    const m = byoFailureMessage("mailgun", "401 Forbidden");
    assert.match(m, /^Not sent: your Mailgun account/);
    assert.match(m, /Nothing was sent through Rootmail's account/);
  });
});
