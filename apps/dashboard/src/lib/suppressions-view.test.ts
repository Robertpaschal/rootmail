import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSuppressionPage, parseSuppressionQuery, rangeLabel, reasonLabel, suppressionsHref } from "./suppressions-view";

describe("suppressions list view helpers", () => {
  it("labels every enum reason and passes unknown ones through", () => {
    assert.deepEqual(["bounce", "complaint", "unsubscribe", "manual"].map(reasonLabel), ["Bounce", "Complaint", "Unsubscribe", "Manual"]);
    assert.equal(reasonLabel("future_reason"), "future_reason");
  });
  it("parses the page defensively", () => {
    assert.equal(parseSuppressionPage(undefined), 1);
    assert.equal(parseSuppressionPage("3"), 3);
    for (const bad of ["0", "-1", "2.5", "abc", "99999"]) assert.equal(parseSuppressionPage(bad), 1);
  });
  it("normalises the search", () => {
    assert.equal(parseSuppressionQuery("  "), undefined);
    assert.equal(parseSuppressionQuery(" a@b.c "), "a@b.c");
    assert.equal(parseSuppressionQuery("x".repeat(300))!.length, 254);
  });
  it("builds hrefs that keep the search and drop page=1", () => {
    assert.equal(suppressionsHref(1), "/deliverability#suppressed");
    assert.equal(suppressionsHref(2, "a@b"), "/deliverability?sup_q=a%40b&sup_page=2#suppressed");
  });
  it("describes the visible range", () => {
    assert.equal(rangeLabel(1, 50, 0, 0), null);
    assert.equal(rangeLabel(2, 50, 50, 130), "51–100 of 130");
  });
});
