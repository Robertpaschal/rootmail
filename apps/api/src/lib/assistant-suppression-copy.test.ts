import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Customers cannot delete bounce/complaint suppressions (staff-only:
// DELETE /v1/admin/suppressions/:id, support.manage). The help assistant
// must not tell them to "remove the suppression".
const src = readFileSync(fileURLToPath(new URL("./assistant.ts", import.meta.url)), "utf8");

test("assistant copy no longer tells customers to remove the suppression", () => {
  assert.equal(/remove the suppression/i.test(src), false);
});

test("assistant copy points to resubscribe and Rootmail support", () => {
  const prompt = src.match(/resubscribe the contact\./g) ?? [];
  assert.equal(prompt.length, 2);
  assert.match(src, /contact Rootmail support to review a bounce or complaint suppression/);
  assert.match(src, /contact Rootmail support about a bounce or complaint suppression/);
});
