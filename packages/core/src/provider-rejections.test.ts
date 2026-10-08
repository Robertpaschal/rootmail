import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnconfirmedRecipientRejection } from "./provider-rejections";

const rejected = (identities: string) =>
  Object.assign(new Error(`Email address is not verified. The following identities failed the check in region EU-WEST-1: ${identities}`), { name: "MessageRejected" });

describe("isUnconfirmedRecipientRejection", () => {
  it("recognises the sandbox refusing an unconfirmed recipient, whatever the case", () => {
    assert.equal(isUnconfirmedRecipientRejection(rejected("Stranger@Example.com"), "stranger@example.com"), true);
  });

  it("does not blame the recipient when it is our sender that is unverified", () => {
    assert.equal(isUnconfirmedRecipientRejection(rejected("no-reply@rootmail.io"), "stranger@example.com"), false);
  });

  it("ignores every other failure", () => {
    assert.equal(isUnconfirmedRecipientRejection(new Error("Throttling: Maximum sending rate exceeded."), "a@b.c"), false);
    assert.equal(isUnconfirmedRecipientRejection("Email address is not verified: a@b.c", "a@b.c"), false);
  });
});
