import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSuppressed, type SuppressionRow } from "./suppression";

// Suppression scoping (brief P1.3). Two independent rules meet here, and a
// regression in either is a customer-facing incident that produces no error:
// either wanted mail silently stops, or unwanted mail silently resumes.

const TENANT_A = "tnt_a";
const TENANT_B = "tnt_b";

const wsWide = (reason: SuppressionRow["reason"]): SuppressionRow => ({ subTenantId: null, reason });
const forTenant = (id: string, reason: SuppressionRow["reason"]): SuppressionRow => ({
  subTenantId: id,
  reason,
});

const send = (type: "transactional" | "marketing" | "sales", subTenantId: string | null = null) => ({
  type,
  subTenantId,
});

describe("suppression scope — hierarchy", () => {
  it("a workspace-wide entry blocks the parent's own mail", () => {
    assert.equal(isSuppressed([wsWide("bounce")], send("transactional")), true);
  });

  it("a workspace-wide entry also blocks every client's mail", () => {
    assert.equal(isSuppressed([wsWide("bounce")], send("transactional", TENANT_A)), true);
    assert.equal(isSuppressed([wsWide("bounce")], send("transactional", TENANT_B)), true);
  });

  it("a client's entry blocks that client", () => {
    assert.equal(isSuppressed([forTenant(TENANT_A, "bounce")], send("transactional", TENANT_A)), true);
  });

  it("one client's entry NEVER blocks another client", () => {
    // The whole point of per-client suppression. If this regresses, tenant A's
    // unsubscribes start silencing tenant B's mail and nothing errors.
    assert.equal(isSuppressed([forTenant(TENANT_A, "bounce")], send("transactional", TENANT_B)), false);
  });

  it("a client's entry never blocks the parent's own workspace-level mail", () => {
    assert.equal(isSuppressed([forTenant(TENANT_A, "bounce")], send("transactional", null)), false);
  });
});

describe("suppression reason — an unsubscribe is a BULK opt-out only", () => {
  it("blocks marketing", () => {
    assert.equal(isSuppressed([wsWide("unsubscribe")], send("marketing")), true);
  });

  it("blocks sales", () => {
    assert.equal(isSuppressed([wsWide("unsubscribe")], send("sales")), true);
  });

  it("does NOT block transactional mail", () => {
    // A password reset, a receipt, or a reply in a live conversation must still
    // go out to someone who unsubscribed from the newsletter.
    assert.equal(isSuppressed([wsWide("unsubscribe")], send("transactional")), false);
  });
});

describe("suppression reason — deliverability reasons stop everything", () => {
  for (const reason of ["bounce", "complaint", "manual"] as const) {
    it(`${reason} blocks transactional mail too`, () => {
      assert.equal(isSuppressed([wsWide(reason)], send("transactional")), true);
      assert.equal(isSuppressed([wsWide(reason)], send("marketing")), true);
    });
  }
});

describe("suppression — combinations", () => {
  it("any single blocking entry is enough", () => {
    const rows = [forTenant(TENANT_B, "bounce"), wsWide("unsubscribe"), forTenant(TENANT_A, "complaint")];
    assert.equal(isSuppressed(rows, send("transactional", TENANT_A)), true);
  });

  it("entries that do not apply are correctly ignored", () => {
    // B's bounce is out of scope; the workspace unsubscribe does not reach
    // transactional. Nothing here blocks an A transactional send.
    const rows = [forTenant(TENANT_B, "bounce"), wsWide("unsubscribe")];
    assert.equal(isSuppressed(rows, send("transactional", TENANT_A)), false);
    // …but it does block A's marketing, via the workspace-wide unsubscribe.
    assert.equal(isSuppressed(rows, send("marketing", TENANT_A)), true);
  });

  it("an empty list never blocks", () => {
    assert.equal(isSuppressed([], send("marketing", TENANT_A)), false);
  });
});
