import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMessageId,
  buildReferences,
  parseMessageIds,
  replyThreadingHeaders,
  sesProviderIdFromMessageId,
  threadingCandidates,
} from "./message-id";

// RFC threading (brief P2.5). These run on headers written by strangers' mail
// clients, so the parsing has to survive folding, commas, commentary and abuse,
// and the ORDER matters: get it wrong and a reply lands on the wrong conversation.

describe("message id", () => {
  it("uses the entry id as the local part so a quote needs no lookup table", () => {
    assert.equal(buildMessageId("tm_abc", "acme.com"), "<tm_abc@acme.com>");
  });
  it("normalises the domain", () => {
    assert.equal(buildMessageId("tm_abc", "@ACME.com "), "<tm_abc@acme.com>");
  });
});

describe("parsing ids out of real-world headers", () => {
  it("reads a single id", () => {
    assert.deepEqual(parseMessageIds("<a@x.com>"), ["<a@x.com>"]);
  });
  it("reads a space-separated chain", () => {
    assert.deepEqual(parseMessageIds("<a@x.com> <b@x.com>"), ["<a@x.com>", "<b@x.com>"]);
  });
  it("reads a comma-separated, line-folded chain", () => {
    assert.deepEqual(parseMessageIds("<a@x.com>,\r\n <b@x.com>"), ["<a@x.com>", "<b@x.com>"]);
  });
  it("ignores commentary around the ids", () => {
    assert.deepEqual(parseMessageIds("your message <a@x.com> of Tuesday"), ["<a@x.com>"]);
  });
  it("de-duplicates", () => {
    assert.deepEqual(parseMessageIds("<a@x.com> <a@x.com>"), ["<a@x.com>"]);
  });
  it("returns nothing for empty or missing headers", () => {
    assert.deepEqual(parseMessageIds(null), []);
    assert.deepEqual(parseMessageIds(""), []);
    assert.deepEqual(parseMessageIds("no ids here"), []);
  });
  it("caps a hostile chain instead of walking it forever", () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `<id${i}@x.com>`).join(" ");
    assert.ok(parseMessageIds(huge).length <= 20);
  });
});

describe("which conversation a reply is answering", () => {
  it("prefers In-Reply-To over References", () => {
    const c = threadingCandidates({ inReplyTo: "<parent@x>", references: "<root@x> <parent@x>" });
    assert.equal(c[0], "<parent@x>");
  });
  it("walks References backwards, nearest first", () => {
    // The tail is closest to the reply; the head is the root. A reply must land
    // on the conversation it answers, not the oldest one it happens to mention.
    const c = threadingCandidates({ inReplyTo: null, references: "<root@x> <mid@x> <last@x>" });
    assert.deepEqual(c, ["<last@x>", "<mid@x>", "<root@x>"]);
  });
  it("falls back to References when In-Reply-To is absent", () => {
    assert.deepEqual(threadingCandidates({ references: "<a@x>" }), ["<a@x>"]);
  });
  it("has no candidates when neither header is present", () => {
    assert.deepEqual(threadingCandidates({}), []);
  });
});

describe("the References we emit", () => {
  it("is just the parent when starting a chain", () => {
    assert.equal(buildReferences(null, "<p@x>"), "<p@x>");
  });
  it("appends the parent to the parent's own chain", () => {
    assert.equal(buildReferences("<root@x>", "<p@x>"), "<root@x> <p@x>");
  });
  it("never repeats the parent", () => {
    assert.equal(buildReferences("<root@x> <p@x>", "<p@x>"), "<root@x> <p@x>");
  });
  it("keeps the root and the recent tail so long threads stay inside header limits", () => {
    const long = Array.from({ length: 40 }, (_, i) => `<id${i}@x>`).join(" ");
    const out = buildReferences(long, "<p@x>").split(" ");
    assert.ok(out.length <= 20, `kept ${out.length}`);
    assert.equal(out[0], "<id0@x>", "root must survive — it is what clients group on");
    assert.equal(out.at(-1), "<p@x>");
  });
});

describe("reply headers", () => {
  it("emits both headers", () => {
    const h = replyThreadingHeaders({ rfcMessageId: "<p@x>", references: "<root@x>" });
    assert.deepEqual(h, [
      { name: "In-Reply-To", value: "<p@x>" },
      { name: "References", value: "<root@x> <p@x>" },
    ]);
  });
  it("emits nothing rather than a broken header when the parent has no id", () => {
    // Entries sent before this feature existed have no Message-ID. An empty
    // In-Reply-To is worse than none — some clients treat it as a new thread.
    assert.deepEqual(replyThreadingHeaders({ rfcMessageId: null }), []);
  });
});

describe("SES rewrites our Message-ID", () => {
  it("recovers the provider id we already store", () => {
    assert.equal(
      sesProviderIdFromMessageId("<010001917f@us-east-1.amazonses.com>"),
      "010001917f",
    );
  });
  it("ignores ids from anywhere else", () => {
    assert.equal(sesProviderIdFromMessageId("<tm_abc@acme.com>"), null);
    assert.equal(sesProviderIdFromMessageId("<a@notamazonses.com.evil.com>"), null);
    // A domain an attacker can register that merely ENDS in the right letters.
    assert.equal(sesProviderIdFromMessageId("<a@evilamazonses.com>"), null);
  });
});
