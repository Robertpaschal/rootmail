import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BETA_LEAD_COPY, betaLead, closedBetaLine, isBetaSenderEmail } from "./sender-beta-first";

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
  const all = [closedBetaLine(0, 0), closedBetaLine(1, 2), closedBetaLine(3, 0), ...Object.values(BETA_LEAD_COPY).flatMap((c) => Object.values(c))].join(" ");
  it("uses plain closed-beta language with no provider or infrastructure terms", () => {
    assert.match(closedBetaLine(0, 0), /^Closed beta:/);
    assert.ok(closedBetaLine(0, 0).length <= 120);
    assert.doesNotMatch(all, /\bSES\b|sandbox|Amazon|AWS|identity|paused/i);
  });
  it("counts ready addresses", () => {
    assert.equal(closedBetaLine(1, 0), "1 address ready to send.");
    assert.equal(closedBetaLine(2, 1), "2 addresses ready to send · 1 awaiting confirmation.");
  });
});
