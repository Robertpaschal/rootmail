import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headerIdentity, isOtherReplyAddress, senderLine } from "./reply-identity";

const contact = { email: "ada@client.example", name: "Ada Lovelace" };
const inbound = (from: string) => ({ direction: "inbound" as const, from, from_name: null });

describe("senderLine", () => {
  it("never labels an inbound email 'You'", () => {
    for (const c of [contact, { email: "ada@client.example", name: "You" }, { email: "ada@client.example", name: null }]) {
      for (const from of ["ada@client.example", "ADA@client.example", "colleague@client.example"]) {
        assert.doesNotMatch(senderLine(inbound(from), c), /^you\b/i, `${c.name} ${from}`);
        assert.ok(senderLine(inbound(from), c).includes(from), "the real From is always shown");
      }
    }
  });
  it("uses the contact's name only for the contact's own address", () => {
    assert.equal(senderLine(inbound("ada@client.example"), contact), "Ada Lovelace <ada@client.example>");
    assert.equal(senderLine(inbound("colleague@client.example"), contact), "colleague@client.example");
    assert.equal(senderLine(inbound("ada@client.example"), { email: contact.email, name: "you" }), "ada@client.example");
  });
  it("labels outbound as You, with the real From", () => {
    assert.equal(senderLine({ direction: "outbound", from: "beta+o@reply.rootmail.io", from_name: "Acme" }, contact), "You · Acme <beta+o@reply.rootmail.io>");
    assert.equal(senderLine({ direction: "outbound", from: "hello@acme.example", from_name: null }, contact), "You · hello@acme.example");
  });
});

describe("multiple reply addresses", () => {
  it("flags a reply from another address", () => {
    assert.equal(isOtherReplyAddress(inbound("colleague@client.example"), contact), true);
    assert.equal(isOtherReplyAddress(inbound("Ada@Client.example"), contact), false);
    assert.equal(isOtherReplyAddress({ direction: "outbound", from: "x@y.example", from_name: null }, contact), false);
  });
  it("header names the actual reply senders when they differ from the contact", () => {
    assert.deepEqual(headerIdentity(contact, ["ada@client.example", null]), { title: "Ada Lovelace", repliesFrom: [] });
    assert.deepEqual(headerIdentity(contact, ["Colleague@client.example", "colleague@client.example", "ada@client.example", "ops@client.example"]), { title: "Ada Lovelace", repliesFrom: ["colleague@client.example", "ops@client.example"] });
    assert.deepEqual(headerIdentity({ email: "ada@client.example", name: "You" }, []), { title: "ada@client.example", repliesFrom: [] });
  });
});
