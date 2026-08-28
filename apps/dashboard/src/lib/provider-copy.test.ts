import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operatorReason } from "./provider-copy";

describe("operatorReason", () => {
  it("hides SES identity-verification copy, including region", () => {
    const raw =
      "Email address is not verified. The following identities failed the check in region US-EAST-1: ada@example.com";
    const out = operatorReason(raw);
    assert.equal(out, "Sending stopped — that from address is not a sending identity.");
    assert.ok(out && !/US-EAST-1/i.test(out));
    assert.ok(out && !/ada@example.com/.test(out));
  });

  it("hides configuration-set names", () => {
    const out = operatorReason("Configuration set <rootmail> does not exist.");
    assert.equal(out, "Sending stopped — this workspace is not ready to send yet.");
    assert.ok(!/Configuration set/i.test(out ?? ""));
  });

  it("passes through an honest mailbox bounce", () => {
    const raw = "550 5.1.1 The email account that you tried to reach does not exist.";
    assert.equal(operatorReason(raw), raw);
  });

  it("returns null for empty", () => {
    assert.equal(operatorReason(null), null);
    assert.equal(operatorReason("  "), null);
  });
});
