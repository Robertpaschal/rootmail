import assert from "node:assert/strict";
import { test } from "node:test";
import { sequenceSendType } from "./sequence-send-type";

test("customer sequences stay marketing whatever the template says", () => {
  assert.equal(sequenceSendType({ templateType: "transactional", internalOrg: false }), "marketing");
  assert.equal(sequenceSendType({ templateType: "marketing", internalOrg: false }), "marketing");
  assert.equal(sequenceSendType({ templateType: null, internalOrg: false }), "marketing");
});

test("rootmail's own transactional template (the beta invite) goes out as transactional", () => {
  assert.equal(sequenceSendType({ templateType: "transactional", internalOrg: true }), "transactional");
  assert.equal(sequenceSendType({ templateType: "marketing", internalOrg: true }), "marketing");
});
