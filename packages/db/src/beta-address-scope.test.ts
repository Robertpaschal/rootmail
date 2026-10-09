import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { env } from "@rootmail/core";
import { betaAddressOrgId, betaReplyCaptureAvailable, betaSenderDomain, isPlatformBetaFrom, resolveReplyTo } from "./conversations";

// Issued beta addresses — the ones an org may send as and that receive
// hand-typed mail (betaAddressOrgId) — are exactly beta+<org>@ROOTMAIL_DOMAIN
// (legacy) and beta+<org>@betaSenderDomain() (INBOUND_DOMAIN, reply.rootmail.io
// in prod). The safety predicate isPlatformBetaFrom stays broad and unchanged,
// so a beta-shaped address is still never treated as a mailbox.
const apex = () => env.ROOTMAIL_DOMAIN.trim().toLowerCase();
const thr = "thr_scope";
const brand = "reply.theirco.example";
const capture = (d = `reply.${apex()}`) => `reply+${thr}@${d}`;
const modes = ["inbox", "own_mailbox", null] as const;
let saved: string | undefined;
before(() => { saved = env.INBOUND_DOMAIN; env.INBOUND_DOMAIN = `reply.${apex()}`; });
after(() => { env.INBOUND_DOMAIN = saved; });

describe("beta address scope", () => {
  it("accepts both forms: the apex and the INBOUND_DOMAIN form (case and spaces ignored)", () => {
    assert.equal(betaSenderDomain(), `reply.${apex()}`);
    for (const b of [`beta+org_s@${apex()}`, `beta+org_s@reply.${apex()}`, ` BETA+org_s@REPLY.${apex().toUpperCase()} `]) {
      assert.equal(isPlatformBetaFrom(b), true, b);
      assert.equal(betaAddressOrgId(b), "org_s", b);
    }
  });

  it("issues no identity on any other subdomain or lookalike", () => {
    for (const d of [`foo.${apex()}`, `evil.${apex()}`, `x.reply.${apex()}`, `mail.${apex()}`, `reply.${apex()}.evil.example`, `${apex()}.evil.example`, `evil${apex()}`, "brand.example"]) {
      assert.equal(betaAddressOrgId(`beta+org_s@${d}`), null, d);
    }
  });

  it("the safety predicate is unchanged: beta-shaped on the apex or any subdomain is never a mailbox; lookalikes are not", () => {
    for (const d of [apex(), `reply.${apex()}`, `foo.${apex()}`]) assert.equal(isPlatformBetaFrom(`beta+org_s@${d}`), true, d);
    for (const d of [`reply.${apex()}.evil.example`, `${apex()}.evil.example`, `evil${apex()}`, "brand.example"]) assert.equal(isPlatformBetaFrom(`beta+org_s@${d}`), false, d);
  });

  it("keeps the second form derived from INBOUND_DOMAIN, not hard-coded", () => {
    try {
      env.INBOUND_DOMAIN = `inbound.${apex()}`;
      assert.equal(betaAddressOrgId(`beta+org_s@inbound.${apex()}`), "org_s");
      assert.equal(betaAddressOrgId(`beta+org_s@reply.${apex()}`), null);
      env.INBOUND_DOMAIN = undefined;
      assert.equal(betaAddressOrgId(`beta+org_s@${apex()}`), "org_s", "the apex form always counts");
      assert.equal(betaAddressOrgId(`beta+org_s@reply.${apex()}`), null);
      assert.equal(isPlatformBetaFrom(`beta+org_s@reply.${apex()}`), true, "but a worker without INBOUND_DOMAIN still refuses it");
      assert.equal(resolveReplyTo({ fromEmail: `beta+org_s@reply.${apex()}`, conversationId: thr, replyMode: "inbox" }), null);
    } finally { env.INBOUND_DOMAIN = `reply.${apex()}`; }
  });
});

describe("resolveReplyTo precedence is unchanged for the accepted forms", () => {
  it("beta From (either form): capture in every mode; a branded reply domain wins; a beta explicit is ignored", () => {
    for (const from of [`beta+org_s@${apex()}`, `beta+org_s@reply.${apex()}`]) {
      for (const replyMode of modes) {
        assert.equal(resolveReplyTo({ fromEmail: from, conversationId: thr, replyMode }), capture(), `${from} ${replyMode}`);
        assert.equal(resolveReplyTo({ fromEmail: from, conversationId: thr, replyMode, replyDomain: brand }), capture(brand));
        assert.equal(resolveReplyTo({ fromEmail: from, conversationId: thr, replyMode, explicit: "ops@brand.example" }), "ops@brand.example");
        assert.equal(resolveReplyTo({ fromEmail: from, conversationId: thr, replyMode, explicit: from }), capture());
      }
      assert.equal(betaReplyCaptureAvailable({ explicit: from }), true, "capture domain configured");
    }
  });

  it("an ordinary From: explicit wins, own_mailbox is the From, inbox is capture", () => {
    const plain = "hello@brand.example";
    for (const replyMode of modes) {
      assert.equal(resolveReplyTo({ fromEmail: plain, conversationId: thr, replyMode, explicit: "ops@brand.example" }), "ops@brand.example");
    }
    assert.equal(resolveReplyTo({ fromEmail: plain, conversationId: thr, replyMode: "own_mailbox" }), plain);
    assert.equal(resolveReplyTo({ fromEmail: plain, conversationId: thr, replyMode: "inbox" }), capture());
    assert.equal(resolveReplyTo({ fromEmail: plain, conversationId: thr, replyMode: "inbox", replyDomain: brand }), capture(brand));
  });

  it("a beta-shaped address on another subdomain still gets capture, as before", () => {
    const other = `beta+org_s@foo.${apex()}`;
    for (const replyMode of modes) assert.equal(resolveReplyTo({ fromEmail: other, conversationId: thr, replyMode }), capture());
    assert.equal(resolveReplyTo({ fromEmail: "x@brand.example", conversationId: thr, replyMode: "inbox", explicit: other }), capture());
  });
});
