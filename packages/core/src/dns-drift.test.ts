import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDnsDrift, type DnsDriftInput } from "./dns";

// DNS drift rules (brief P2.2). These decide when we stop a paying customer's
// mail because their domain's records went away. Both directions of a mistake
// are customer-facing and silent: too eager and we halt sending over a resolver
// blip, too slow and unauthenticated mail goes out under a domain that can no
// longer prove it, costing the reputation of every tenant on the shared account.

const GRACE = 6;
const NOW = new Date("2026-08-18T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const input = (over: Partial<DnsDriftInput> = {}): DnsDriftInput => ({
  ok: true,
  failingSince: null,
  status: "verified",
  reputationPaused: false,
  now: NOW,
  graceHours: GRACE,
  ...over,
});

describe("dns drift — healthy", () => {
  it("does nothing when a healthy domain still resolves", () => {
    assert.deepEqual(decideDnsDrift(input()), { action: "none" });
  });
});

describe("dns drift — failing", () => {
  it("starts the clock on the first failed check, and does not suspend", () => {
    assert.deepEqual(decideDnsDrift(input({ ok: false })), { action: "drifted" });
  });

  it("holds through the grace period rather than acting on one bad reading", () => {
    const d = decideDnsDrift(input({ ok: false, failingSince: hoursAgo(1) }));
    assert.equal(d.action, "grace");
  });

  it("still holds one minute before the grace period expires", () => {
    const d = decideDnsDrift(input({ ok: false, failingSince: hoursAgo(GRACE - 1 / 60) }));
    assert.equal(d.action, "grace");
  });

  it("suspends once failures are sustained past the grace period", () => {
    assert.deepEqual(decideDnsDrift(input({ ok: false, failingSince: hoursAgo(GRACE) })), {
      action: "suspend",
    });
  });

  it("does not re-suspend a tenant whose sending is already stopped", () => {
    // Otherwise every sweep would write a fresh audit entry and mail the operator
    // again about a client they already know is off.
    const d = decideDnsDrift(input({ ok: false, failingSince: hoursAgo(48), status: "failed" }));
    assert.equal(d.action, "grace");
  });
});

describe("dns drift — recovery", () => {
  it("turns sending back on when DNS is why it went off", () => {
    assert.deepEqual(
      decideDnsDrift(input({ failingSince: hoursAgo(9), status: "failed" })),
      { action: "recovered", restoreSending: true },
    );
  });

  it("clears the drift but leaves a reputation pause alone", () => {
    // The pause is a human decision about their bounce rate. Fixing a TXT record
    // is not evidence the list improved, and a pause that DNS can clear is not a
    // pause — this is the same rule the manual verify route enforces.
    assert.deepEqual(
      decideDnsDrift(
        input({ failingSince: hoursAgo(9), status: "failed", reputationPaused: true }),
      ),
      { action: "recovered", restoreSending: false },
    );
  });

  it("reports recovery without re-verifying a tenant that never stopped", () => {
    // Drifted, fixed inside the grace window: nothing was ever switched off, so
    // there is nothing to switch back on.
    assert.deepEqual(decideDnsDrift(input({ failingSince: hoursAgo(2), status: "verified" })), {
      action: "recovered",
      restoreSending: false,
    });
  });
});
