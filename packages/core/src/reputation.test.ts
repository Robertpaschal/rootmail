import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateReputation,
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THRESHOLDS,
  sampleFromCounts,
} from "./reputation";

// The threshold state machine (brief P1.1). This decides whether a real customer's
// real client keeps sending, so every band and both escape hatches are pinned here.

const enough = REPUTATION_MIN_VERDICTS * 5;
const at = (bounceRate: number, complaintRate = 0, verdicts = enough) => ({
  verdicts,
  bounceRate,
  complaintRate,
});

describe("evaluateReputation — bands", () => {
  it("leaves a clean tenant alone", () => {
    const d = evaluateReputation(at(0.01, 0.0005), "ok");
    assert.equal(d.state, "ok");
    assert.equal(d.changed, false);
    assert.equal(d.crossed, null);
  });

  it("warns above the bounce warn line, without restricting sends", () => {
    const d = evaluateReputation(at(REPUTATION_THRESHOLDS.warn.bounce + 0.001), "ok");
    assert.equal(d.state, "warn");
    assert.equal(d.changed, true);
    assert.equal(d.crossed?.metric, "bounce");
  });

  it("throttles above the throttle line", () => {
    assert.equal(
      evaluateReputation(at(REPUTATION_THRESHOLDS.throttle.bounce + 0.001), "ok").state,
      "throttled",
    );
  });

  it("pauses above the pause line", () => {
    assert.equal(
      evaluateReputation(at(REPUTATION_THRESHOLDS.pause.bounce + 0.001), "ok").state,
      "paused",
    );
  });

  it("treats the thresholds as exclusive — exactly at the line is not over it", () => {
    assert.equal(evaluateReputation(at(REPUTATION_THRESHOLDS.warn.bounce), "ok").state, "ok");
  });

  it("applies the far tighter complaint bands independently of bounces", () => {
    const d = evaluateReputation(at(0, REPUTATION_THRESHOLDS.pause.complaint + 0.0001), "ok");
    assert.equal(d.state, "paused");
    assert.equal(d.crossed?.metric, "complaint");
  });

  it("reports the worst band when both metrics are over", () => {
    const d = evaluateReputation(at(0.2, 0.02), "ok");
    assert.equal(d.state, "paused");
    // Bounce is checked first, so it is the one named — but either is defensible;
    // what matters is that a metric and its threshold are always reported.
    assert.ok(d.crossed);
    assert.equal(typeof d.crossed?.threshold, "number");
  });
});

describe("evaluateReputation — the low-volume floor", () => {
  it("does not act on a handful of sends, however bad they look", () => {
    // One bounce out of three is 33%, six times the pause threshold. A new client
    // on their first afternoon must not be paused for it.
    const d = evaluateReputation({ verdicts: 3, bounceRate: 0.33, complaintRate: 0.33 }, "ok");
    assert.equal(d.state, "ok");
    assert.equal(d.changed, false);
  });

  it("acts as soon as there is exactly enough evidence", () => {
    const d = evaluateReputation(
      { verdicts: REPUTATION_MIN_VERDICTS, bounceRate: 0.5, complaintRate: 0 },
      "ok",
    );
    assert.equal(d.state, "paused");
  });

  it("does not let a restricted tenant escape by going quiet", () => {
    // Falling under the floor must HOLD the current state, never clear it —
    // otherwise stopping sending for a week is a way to reset your record.
    assert.equal(evaluateReputation({ verdicts: 0, bounceRate: 0, complaintRate: 0 }, "throttled").state, "throttled");
    assert.equal(evaluateReputation({ verdicts: 2, bounceRate: 0, complaintRate: 0 }, "warn").state, "warn");
  });
});

describe("evaluateReputation — recovery", () => {
  it("clears warn and throttle on their own once the numbers recover", () => {
    assert.equal(evaluateReputation(at(0), "warn").state, "ok");
    assert.equal(evaluateReputation(at(0), "throttled").state, "ok");
  });

  it("de-escalates throttled → warn rather than ratcheting", () => {
    const d = evaluateReputation(at(REPUTATION_THRESHOLDS.warn.bounce + 0.001), "throttled");
    assert.equal(d.state, "warn");
    assert.equal(d.changed, true);
  });

  it("NEVER auto-resumes a paused tenant, however clean it now looks", () => {
    // A tenant that pauses and then sends nothing 'recovers' on a decaying
    // trailing average without fixing anything. Only a human at the parent
    // workspace moves this one.
    const d = evaluateReputation(at(0, 0, 10_000), "paused");
    assert.equal(d.state, "paused");
    assert.equal(d.changed, false);
  });

  it("reports changed=false when the state is unmoved, so nothing re-notifies", () => {
    assert.equal(evaluateReputation(at(0.2), "paused").changed, false);
    assert.equal(evaluateReputation(at(0.09), "throttled").changed, false);
  });
});

describe("sampleFromCounts", () => {
  it("counts only judged sends as verdicts", () => {
    const s = sampleFromCounts({ delivered: 90, bounced: 10, complained: 0 });
    assert.equal(s.verdicts, 100);
    assert.equal(s.bounceRate, 0.1);
  });

  it("excludes bounces from the complaint denominator — a bounce never reached an inbox", () => {
    const s = sampleFromCounts({ delivered: 99, bounced: 900, complained: 1 });
    assert.equal(s.complaintRate, 1 / 100);
  });

  it("is zero, not NaN, with no data at all", () => {
    const s = sampleFromCounts({ delivered: 0, bounced: 0, complained: 0 });
    assert.equal(s.verdicts, 0);
    assert.equal(s.bounceRate, 0);
    assert.equal(s.complaintRate, 0);
  });
});
