import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BETA_LEAD_COPY, betaLead, isBetaSenderEmail, senderCountLine } from "./sender-beta-first";

const D = "rootmail.io";
const s = (email: string, status = "verified", is_default = false) => ({ email, status, is_default });

describe("isBetaSenderEmail", () => {
  it("matches both beta forms on Rootmail's domain only", () => {
    assert.equal(isBetaSenderEmail("beta+org_1@rootmail.io", D), true);
    assert.equal(isBetaSenderEmail("BETA+org_1@reply.rootmail.io", D), true);
    for (const e of ["beta+org_1@theirco.com", "beta+org_1@evilrootmail.io", "beta+@rootmail.io", "hello@rootmail.io"]) assert.equal(isBetaSenderEmail(e, D), false, e);
  });
});

describe("betaLead", () => {
  it("offers activation when available and none exists", () => {
    assert.deepEqual(betaLead([s("hello@theirco.com")], true, D), { kind: "activate" });
    assert.deepEqual(betaLead([], false, D), { kind: "none" });
  });
  it("shows an existing verified beta address first, even when activation isn't offered", () => {
    assert.deepEqual(betaLead([s("hello@theirco.com", "verified", true), s("beta+o@reply.rootmail.io")], false, D), { kind: "active", email: "beta+o@reply.rootmail.io", isDefault: false });
    assert.deepEqual(betaLead([s("beta+o@rootmail.io", "verified", true)], true, D), { kind: "active", email: "beta+o@rootmail.io", isDefault: true });
  });
  it("ignores an unverified beta-looking row", () => {
    assert.deepEqual(betaLead([s("beta+o@rootmail.io", "pending")], true, D), { kind: "activate" });
  });
});

describe("copy", () => {
  it("lead copy uses plain language with no provider or infrastructure terms", () => {
    const all = Object.values(BETA_LEAD_COPY).flatMap((c) => Object.values(c)).join(" ");
    assert.doesNotMatch(all, /\bSES\b|sandbox|Amazon|AWS|identity|paused/i);
  });
  it("the count line is the pre-#29 wording, byte for byte", () => {
    assert.equal(senderCountLine(1, 0), "1 address verified.");
    assert.equal(senderCountLine(2, 1), "2 addresses verified · 1 still awaiting confirmation.");
    assert.equal(senderCountLine(0, 3), "Dashboard sending is paused until you verify a sending address. You can prepare templates and campaign drafts in the meantime.");
    assert.doesNotMatch([senderCountLine(0, 0), senderCountLine(3, 1)].join(" "), /\bSES\b|sandbox|Amazon|AWS/i);
  });
});
