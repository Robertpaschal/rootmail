import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSegment, MAX_CONDITIONS, validateSegmentFilter } from "./segments";

// Rule-based audiences turn caller-supplied JSON into SQL. The file's own header
// lists five absolute rules for keeping that safe; these pin the ones a refactor
// could quietly drop. A rule that "degrades to match everything" mails people who
// were meant to be excluded, so every failure here must be a THROW, never a pass.

const ok = (conditions: unknown[], match?: string) =>
  validateSegmentFilter({ match, conditions } as never);

describe("validateSegmentFilter — accepts what it should", () => {
  it("accepts a known field with a value operator", () => {
    const f = ok([{ field: "email", op: "contains", value: "@acme.com" }]);
    assert.equal(f.conditions.length, 1);
  });

  it("defaults match to all", () => {
    assert.equal(ok([{ field: "status", op: "eq", value: "active" }]).match, "all");
  });

  it("accepts an explicit any", () => {
    assert.equal(ok([{ field: "status", op: "eq", value: "active" }], "any").match, "any");
  });

  it("accepts a caller-named trait key", () => {
    assert.doesNotThrow(() => ok([{ field: "trait:plan_id", op: "eq", value: "scale" }]));
  });

  it("accepts existence operators with no value", () => {
    assert.doesNotThrow(() => ok([{ field: "trait:seats", op: "exists" }]));
    assert.doesNotThrow(() => ok([{ field: "trait:seats", op: "not_exists" }]));
  });
});

describe("validateSegmentFilter — rejects rather than degrades", () => {
  it("rejects a non-object rule", () => {
    for (const bad of [null, undefined, 42, "conditions", true]) {
      assert.throws(() => validateSegmentFilter(bad));
    }
  });

  it("rejects a rule with no conditions — never 'match everyone'", () => {
    assert.throws(() => validateSegmentFilter({ conditions: [] }));
    assert.throws(() => validateSegmentFilter({ conditions: "all" }));
    assert.throws(() => validateSegmentFilter({}));
  });

  it("rejects an unknown match mode", () => {
    assert.throws(() => ok([{ field: "email", op: "eq", value: "x" }], "none"));
  });

  it("bounds the number of conditions", () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, () => ({
      field: "email",
      op: "eq",
      value: "x",
    }));
    assert.throws(() => ok(many));
    // …and permits exactly the maximum.
    assert.doesNotThrow(() => ok(many.slice(0, MAX_CONDITIONS)));
  });

  it("rejects any field name that is not on the allow-list", () => {
    // Rule 1: field names are never interpolated. A caller must not be able to
    // name a column, a table, or a function.
    for (const field of [
      "password_hash",
      "contacts.id",
      "1=1",
      "email; drop table contacts",
      "(select 1)",
      "pg_sleep(10)",
      "",
    ]) {
      assert.throws(
        () => ok([{ field, op: "eq", value: "x" }]),
        Error,
        `field ${JSON.stringify(field)} must be rejected`,
      );
    }
  });

  it("rejects an unknown operator instead of passing it through", () => {
    // Rule 4: operators come from a fixed table.
    for (const op of ["gt", "regex", "=", "or 1=1", ""]) {
      assert.throws(() => ok([{ field: "email", op, value: "x" }]));
    }
  });

  it("rejects a hostile trait key rather than concatenating it", () => {
    // Rule 2: trait keys are caller-supplied and must stay a bound parameter.
    for (const key of ["a'b", "a\"b", "a;b", "a b", "a)b"]) {
      assert.throws(() => ok([{ field: `trait:${key}`, op: "exists" }]));
    }
  });
});

describe("isSegment — one predicate for 'is this a rule'", () => {
  it("is true only for an object filter", () => {
    assert.equal(isSegment({ filter: { conditions: [] } }), true);
    assert.equal(isSegment({ filter: null }), false);
    assert.equal(isSegment({ filter: undefined }), false);
  });
});
