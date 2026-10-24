import assert from "node:assert/strict";
import { test } from "node:test";
import { sendHistoryLabel, stopMethod } from "./send-history-label";

test("a send blocked by the suppression list reads as not sent", () => {
  assert.equal(sendHistoryLabel("suppressed"), "Not sent (suppressed)");
});

test("characterization: real outcomes keep their previous wording", () => {
  // Previously rendered as the raw status with CSS `capitalize`.
  assert.equal(sendHistoryLabel("bounced"), "Bounced");
  assert.equal(sendHistoryLabel("complained"), "Complained");
  assert.equal(sendHistoryLabel("delivered"), "Delivered");
  assert.equal(sendHistoryLabel("sent"), "Sent");
  assert.equal(sendHistoryLabel("failed"), "Failed");
  assert.equal(sendHistoryLabel("queued"), "Queued");
  assert.equal(sendHistoryLabel(""), "");
});

test("a suppression stop is not attributed to the provider; real stops still are", () => {
  assert.equal(stopMethod("suppressed"), "blocked before sending");
  assert.equal(stopMethod("bounced"), "provider feedback");
  assert.equal(stopMethod("complained"), "provider feedback");
  assert.equal(stopMethod("failed"), "provider feedback");
});
