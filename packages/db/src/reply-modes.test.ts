import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { env } from "@rootmail/core";
import { betaReplyCaptureAvailable, isPlatformBetaFrom, resolveReplyTo } from "./conversations";

// Robert's reply-mode rules, one block per mode. Non-beta senders behave exactly
// as before the beta address moved to the reply subdomain; a beta From — in
// EITHER form — always gets reply capture, on the org's branded reply domain
// when one is active.
const apex = () => env.ROOTMAIL_DOMAIN.toLowerCase();
const thr = "thr_modes";
const brand = "reply.theirco.example";
const plain = "hello@brand.example";
const betas = () => [`beta+org_m@${apex()}`, `beta+org_m@reply.${apex()}`];
const capture = (d = `reply.${apex()}`) => `reply+${thr}@${d}`;
const r = (o: Partial<Parameters<typeof resolveReplyTo>[0]>) => resolveReplyTo({ replyMode: "inbox", conversationId: thr, fromEmail: plain, ...o });
let saved: string | undefined;
before(() => { saved = env.INBOUND_DOMAIN; env.INBOUND_DOMAIN = `reply.${apex()}`; });
after(() => { env.INBOUND_DOMAIN = saved; });

describe("predicates", () => {
  it("recognise both beta forms, and nothing else", () => {
    for (const b of betas()) { assert.equal(isPlatformBetaFrom(b), true, b); assert.equal(isPlatformBetaFrom(b.toUpperCase()), true); }
    for (const n of [plain, `no-reply@${apex()}`, `beta+x@brand.example`, `beta+@${apex()}`, `reply+thr_x@reply.${apex()}`]) assert.equal(isPlatformBetaFrom(n), false, n);
  });
});

describe("mode: explicit reply_to", () => {
  it("non-beta From: the explicit address wins in every mode and over a branded domain", () => {
    for (const replyMode of ["inbox", "own_mailbox", null]) {
      assert.equal(r({ replyMode, explicit: "support@brand.example" }), "support@brand.example");
      assert.equal(r({ replyMode, explicit: "support@brand.example", replyDomain: brand }), "support@brand.example");
    }
  });
  it("beta From (both forms): a real explicit address is kept; a beta address as reply_to is ignored", () => {
    for (const fromEmail of betas()) {
      assert.equal(r({ fromEmail, explicit: "support@brand.example" }), "support@brand.example");
      for (const explicit of betas()) {
        assert.equal(r({ fromEmail, explicit }), capture());
        assert.equal(r({ fromEmail, explicit, replyDomain: brand }), capture(brand));
        assert.equal(r({ fromEmail: plain, explicit }), capture(), "a beta reply_to on a plain From falls through to inbox");
      }
    }
  });
});

describe("mode: own_mailbox", () => {
  it("non-beta From: replies go to the From itself, even with a branded domain; the platform no-reply is captured", () => {
    assert.equal(r({ replyMode: "own_mailbox" }), plain);
    assert.equal(r({ replyMode: "own_mailbox", replyDomain: brand }), plain);
    // no-reply-always-capture: the platform no-reply has no mailbox, so it is captured in every mode.
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: `no-reply@${apex()}` }), capture());
  });
  it("beta From (both forms): still captured, because there is no mailbox behind it", () => {
    for (const fromEmail of betas()) assert.equal(r({ replyMode: "own_mailbox", fromEmail }), capture());
  });
});

describe("mode: inbox (default)", () => {
  it("non-beta From: the capture address; the From when capture isn't configured", () => {
    for (const replyMode of ["inbox", null, undefined]) assert.equal(r({ replyMode }), capture());
    env.INBOUND_DOMAIN = undefined;
    try {
      assert.equal(r({}), plain);
      assert.equal(r({ fromEmail: `no-reply@${apex()}` }), null);
    } finally { env.INBOUND_DOMAIN = `reply.${apex()}`; }
  });
  it("beta From (both forms): the capture address; null (worker refuses) when none is configured", () => {
    for (const fromEmail of betas()) {
      assert.equal(r({ fromEmail }), capture());
      env.INBOUND_DOMAIN = undefined;
      try {
        assert.equal(r({ fromEmail }), null);
        assert.equal(betaReplyCaptureAvailable(), false);
      } finally { env.INBOUND_DOMAIN = `reply.${apex()}`; }
      assert.equal(betaReplyCaptureAvailable(), true);
    }
  });
});

describe("mode: active branded reply domain", () => {
  it("non-beta From: inbox captures on reply.theirco; own_mailbox and explicit are unchanged (above)", () => {
    assert.equal(r({ replyDomain: brand }), capture(brand));
  });
  it("beta From (both forms): reply.theirco in every mode, even without INBOUND_DOMAIN", () => {
    for (const fromEmail of betas()) {
      for (const replyMode of ["inbox", "own_mailbox", null]) assert.equal(r({ fromEmail, replyMode, replyDomain: brand }), capture(brand), `${fromEmail} ${replyMode}`);
      env.INBOUND_DOMAIN = undefined;
      try {
        assert.equal(r({ fromEmail, replyDomain: brand }), capture(brand));
        assert.equal(betaReplyCaptureAvailable({ replyDomain: brand }), true);
      } finally { env.INBOUND_DOMAIN = `reply.${apex()}`; }
    }
  });
});
