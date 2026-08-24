import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRetryMessage, type RetryCandidate } from "./retry";

// Retry eligibility. The failure mode this guards is the one with no undo:
// sending a second copy of an email that was already accepted.

const m = (over: Partial<RetryCandidate> = {}): RetryCandidate => ({
  status: "failed",
  providerMessageId: null,
  error: "Header <Message-ID> is not supported",
  ...over,
});

describe("the one rule that cannot be overridden", () => {
  it("refuses a message the provider already accepted", () => {
    const v = canRetryMessage(m({ providerMessageId: "0100019-abc" }));
    assert.equal(v.retryable, false);
  });

  it("refuses it even when the message is marked failed", () => {
    // Accepted-then-failed happens: the provider took it and a later event
    // marked it failed. The mail still went out. A retry duplicates it.
    const v = canRetryMessage(m({ status: "failed", providerMessageId: "0100019-abc" }));
    assert.equal(v.retryable, false);
    assert.match((v as { reason: string }).reason, /second copy/);
  });
});

describe("what may be retried", () => {
  it("allows a message that never reached the provider", () => {
    const v = canRetryMessage(m());
    assert.equal(v.retryable, true);
    assert.equal((v as { caution: string | null }).caution, null);
  });

  it("allows it but warns when the address itself is the problem", () => {
    const v = canRetryMessage(m({ error: "550 5.1.1 User unknown" }));
    assert.equal(v.retryable, true);
    assert.match((v as { caution: string }).caution!, /recipient's address/);
  });
});

describe("what may not", () => {
  it("refuses a suppressed message rather than overriding an opt-out", () => {
    assert.equal(canRetryMessage(m({ status: "suppressed" })).retryable, false);
  });

  it("refuses a bounce — it would bounce again on a shared reputation", () => {
    assert.equal(canRetryMessage(m({ status: "bounced" })).retryable, false);
  });

  it("refuses a complaint", () => {
    assert.equal(canRetryMessage(m({ status: "complained" })).retryable, false);
  });

  it("refuses anything still in flight", () => {
    assert.equal(canRetryMessage(m({ status: "queued" })).retryable, false);
    assert.equal(canRetryMessage(m({ status: "sending" })).retryable, false);
  });

  it("refuses what already worked", () => {
    assert.equal(canRetryMessage(m({ status: "sent" })).retryable, false);
    assert.equal(canRetryMessage(m({ status: "delivered" })).retryable, false);
  });
});
