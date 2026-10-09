// Google Workspace reserves abuse@ and postmaster@ on rootmail.io — they are not
// mailboxes we create or read. Nothing user-facing (site, docs, legal pages,
// app copy, code) may publish or depend on them; abuse reports go to security@.
//
//   node --test scripts/reserved-mailboxes.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOTS = ["apps", "packages", "docs"];
const SKIP = new Set(["node_modules", ".next", "dist", ".turbo", "build"]);
const EXT = /\.(tsx?|mjs|cjs|js|mdx?|json|html|txt)$/;
// abuse@rootmail.io, mailto:postmaster@…, or `${…}` templates naming them.
const RESERVED = /\b(?:abuse|postmaster)@(?:rootmail\.io|\$\{[^}]*ROOTMAIL_DOMAIN[^}]*\})/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(name)) yield p;
  }
}

test("no abuse@ or postmaster@ rootmail.io mailbox is referenced", () => {
  const hits = [];
  for (const root of ROOTS) {
    for (const f of files(root)) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => { if (RESERVED.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`); });
    }
  }
  assert.deepEqual(hits, []);
});

test("the acceptable-use policy points abuse reports at security@", () => {
  const aup = readFileSync("apps/marketing/src/app/legal/acceptable-use/page.tsx", "utf8");
  assert.match(aup, /mailto:security@rootmail\.io/);
});
