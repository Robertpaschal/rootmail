import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BETA_RESEND_URL, firstSendNote } from "./first-send-note";

const inbox = (email: string, status: "pending" | "verified") => ({ id: email, email, label: null, status, verified_at: null });

describe("firstSendNote", () => {
  it("asks for confirmation while sending is limited and the owner's address is not confirmed", () => {
    const note = firstSendNote({ required: true, data: [inbox("ada@example.com", "pending")] }, "Ada@Example.com");
    assert.ok(note);
    assert.match(note.body, /email from Amazon Web Services sent to ada@example\.com/);
    assert.doesNotMatch(`${note.title} ${note.body} ${note.confirmLabel} ${note.resendLabel}`, /\bSES\b|sandbox|identit|region|us-east|AWS\b/i);
  });

  it("stays out of the way once the address is confirmed or no confirmation is required", () => {
    assert.equal(firstSendNote({ required: true, data: [inbox("ada@example.com", "verified")] }, "ada@example.com"), null);
    assert.equal(firstSendNote({ required: false, data: [] }, "ada@example.com"), null);
    assert.equal(firstSendNote(null, "ada@example.com"), null);
  });

  it("still explains when the owner's address is unknown", () => {
    assert.match(firstSendNote({ required: true, data: [] }, null)!.body, /sent to your address/);
  });

  it("points at the /beta resend form", () => {
    assert.equal(BETA_RESEND_URL, "https://rootmail.io/beta#resend-confirmation");
  });
});
