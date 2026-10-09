import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { env } from "@rootmail/core";
import { isRootmailNoReply, resolveReplyTo } from "./conversations";

// The platform no-reply has no mailbox behind it. A reply to it must always be
// captured, whatever the org's reply mode; a real mailbox in own_mailbox mode
// keeps getting its replies directly, exactly as before.
const thr = "thr_nr";
const noReply = () => `no-reply@${env.ROOTMAIL_DOMAIN}`;
const cap = (d = "reply.example.test") => `reply+${thr}@${d}`;
const r = (o: Partial<Parameters<typeof resolveReplyTo>[0]>) => resolveReplyTo({ replyMode: "inbox", conversationId: thr, fromEmail: noReply(), ...o });
let saved: string | undefined;
before(() => { saved = env.INBOUND_DOMAIN; env.INBOUND_DOMAIN = "reply.example.test"; });
after(() => { env.INBOUND_DOMAIN = saved; });

describe("platform no-reply From: always captured", () => {
  it("recognises the address, case- and space-insensitively", () => {
    assert.equal(isRootmailNoReply(` NO-REPLY@${env.ROOTMAIL_DOMAIN.toUpperCase()} `), true);
    assert.equal(isRootmailNoReply("no-reply@brand.example"), false, "a customer's own no-reply is a real address of theirs");
    assert.equal(isRootmailNoReply(null), false);
  });
  it("own_mailbox, inbox and unset mode all get the capture address", () => {
    for (const replyMode of ["own_mailbox", "inbox", null, undefined]) assert.equal(r({ replyMode }), cap(), String(replyMode));
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: noReply().toUpperCase() }), cap());
  });
  it("uses the org's active branded reply domain", () => {
    for (const replyMode of ["own_mailbox", "inbox"]) assert.equal(r({ replyMode, replyDomain: "reply.theirco.example" }), cap("reply.theirco.example"));
  });
  it("an explicit non-beta reply_to still wins; a beta one is ignored", () => {
    assert.equal(r({ replyMode: "own_mailbox", explicit: "support@brand.example" }), "support@brand.example");
    assert.equal(r({ replyMode: "own_mailbox", explicit: `beta+org_x@${env.ROOTMAIL_DOMAIN}` }), cap());
  });
  it("no capture domain at all: null, as before (never the no-reply itself)", () => {
    env.INBOUND_DOMAIN = undefined;
    try {
      for (const replyMode of ["own_mailbox", "inbox"]) assert.equal(r({ replyMode }), null);
    } finally { env.INBOUND_DOMAIN = "reply.example.test"; }
  });
});

describe("real mailboxes: exactly as on main", () => {
  const real = "hello@brand.example";
  it("own_mailbox → the From itself, even with capture or a branded domain available", () => {
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: real }), real);
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: real, replyDomain: "reply.theirco.example" }), real);
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: `no-reply@brand.example` }), "no-reply@brand.example");
  });
  it("inbox → capture, else the From", () => {
    assert.equal(r({ fromEmail: real }), cap());
    env.INBOUND_DOMAIN = undefined;
    try { assert.equal(r({ fromEmail: real }), real); } finally { env.INBOUND_DOMAIN = "reply.example.test"; }
  });
  it("explicit reply_to wins", () => {
    assert.equal(r({ replyMode: "own_mailbox", fromEmail: real, explicit: "x@brand.example" }), "x@brand.example");
  });
});
