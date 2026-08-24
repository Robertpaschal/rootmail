import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DKIM_PREVIOUS_RETIRE_DAYS, DKIM_ROTATION_AGE_DAYS, DKIM_ROTATION_STALL_DAYS } from "./constants";
import { decideDkimRotation, type DkimRotationInput, nextDkimSelector, previousRetireAt } from "./dkim-rotation";

// DKIM rotation (brief P2.3). The property under test is that rotating never
// drops a message: we sign with the old key until the new record resolves, and
// the old record outlives the cutover so deferred mail still verifies.

const NOW = new Date("2026-08-18T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const input = (over: Partial<DkimRotationInput> = {}): DkimRotationInput => ({
  pendingResolves: false,
  rotationStartedAt: null,
  hasPending: false,
  rotatedAt: null,
  verifiedAt: daysAgo(10),
  previousRetireAt: null,
  now: NOW,
  autoStart: true,
  ...over,
});

describe("when rotation starts", () => {
  it("leaves a young key alone", () => {
    assert.deepEqual(decideDkimRotation(input()), { action: "none" });
  });

  it("starts once the key reaches the rotation age", () => {
    assert.deepEqual(
      decideDkimRotation(input({ verifiedAt: daysAgo(DKIM_ROTATION_AGE_DAYS) })),
      { action: "start" },
    );
  });

  it("measures age from the LAST cutover, not first verification", () => {
    // A tenant verified two years ago but rotated last month is not due.
    assert.deepEqual(
      decideDkimRotation(input({ verifiedAt: daysAgo(730), rotatedAt: daysAgo(30) })),
      { action: "none" },
    );
  });

  it("never starts on its own when auto-start is off", () => {
    assert.deepEqual(
      decideDkimRotation(input({ verifiedAt: daysAgo(9999), autoStart: false })),
      { action: "none" },
    );
  });

  it("does nothing for a tenant that never verified — it has no key in use", () => {
    assert.deepEqual(decideDkimRotation(input({ verifiedAt: null })), { action: "none" });
  });
});

describe("while a rotation is in flight", () => {
  it("waits — and therefore keeps signing with the old key — until the record resolves", () => {
    // THE core safety property. Anything but "none" here would cut over to a key
    // whose record does not exist, failing authentication on every message.
    assert.deepEqual(
      decideDkimRotation(input({ hasPending: true, pendingResolves: false, rotationStartedAt: daysAgo(1) })),
      { action: "none" },
    );
  });

  it("promotes as soon as the new record resolves", () => {
    assert.deepEqual(
      decideDkimRotation(input({ hasPending: true, pendingResolves: true, rotationStartedAt: daysAgo(1) })),
      { action: "promote" },
    );
  });

  it("says so once it has clearly stalled, but still does not enforce", () => {
    const d = decideDkimRotation(
      input({ hasPending: true, rotationStartedAt: daysAgo(DKIM_ROTATION_STALL_DAYS) }),
    );
    assert.equal(d.action, "stalled");
  });

  it("does not nag on day one of a stall", () => {
    assert.equal(
      decideDkimRotation(input({ hasPending: true, rotationStartedAt: daysAgo(1) })).action,
      "none",
    );
  });

  it("promotes a stalled rotation the moment it finally resolves", () => {
    assert.deepEqual(
      decideDkimRotation(
        input({ hasPending: true, pendingResolves: true, rotationStartedAt: daysAgo(90) }),
      ),
      { action: "promote" },
    );
  });

  it("never auto-starts a second rotation while one is pending", () => {
    assert.equal(
      decideDkimRotation(
        input({ hasPending: true, verifiedAt: daysAgo(9999), rotationStartedAt: daysAgo(1) }),
      ).action,
      "none",
    );
  });
});

describe("retiring the old selector", () => {
  it("keeps the old record published until deferred mail can no longer need it", () => {
    assert.deepEqual(
      decideDkimRotation(input({ previousRetireAt: new Date(NOW.getTime() + 86_400_000) })),
      { action: "none" },
    );
  });

  it("retires it once the window has passed", () => {
    assert.deepEqual(
      decideDkimRotation(input({ previousRetireAt: daysAgo(1) })),
      { action: "retire" },
    );
  });

  it("retires even while a new rotation is already in flight", () => {
    // Cleanup of an old selector must not be blocked by unrelated work, or a
    // stalled rotation would pin a stale public key in DNS indefinitely.
    assert.deepEqual(
      decideDkimRotation(input({ previousRetireAt: daysAgo(1), hasPending: true })),
      { action: "retire" },
    );
  });

  it("sets the retire window a full grace period after cutover", () => {
    const at = previousRetireAt(NOW);
    assert.equal((at.getTime() - NOW.getTime()) / 86_400_000, DKIM_PREVIOUS_RETIRE_DAYS);
  });
});

describe("choosing the next selector", () => {
  it("date-stamps it so it can never collide with the one still published", () => {
    assert.equal(nextDkimSelector("rootmail", NOW), "rootmail-202608");
  });

  it("does not compound stamps when rotating a rotated selector", () => {
    assert.equal(nextDkimSelector("rootmail-202602", NOW), "rootmail-202608");
  });

  it("disambiguates a second rotation inside the same month", () => {
    // Publishing the same selector twice would overwrite the record still in use.
    assert.equal(nextDkimSelector("rootmail-202608", NOW), "rootmail-202608b");
  });
});
