import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolveDeliveryAddress, suppressionAddressFor } from "@rootmail/core";

// Regression: a bounce on bounced@test.rootmail.dev was reported by SES against
// bounce@simulator.amazonses.com, the suppression was keyed on that, and the
// alias was never blocked on re-send.
test("simulator bounce maps back to the test alias", () => {
  const alias = "bounced@test.rootmail.dev";
  assert.equal(suppressionAddressFor(resolveDeliveryAddress(alias), alias), alias);
  assert.equal(suppressionAddressFor("Bounce@Simulator.AmazonSES.com", alias), alias);
});

test("simulator complaint maps back to the test alias", () => {
  const alias = "complained@test.rootmail.dev";
  assert.equal(suppressionAddressFor("complaint@simulator.amazonses.com", alias), alias);
});

// Characterization: real recipients are untouched.
test("real recipients are returned unchanged", () => {
  assert.equal(suppressionAddressFor("a@example.com", "a@example.com"), "a@example.com");
  assert.equal(suppressionAddressFor("b@example.com", "a@example.com"), "b@example.com");
});

test("a non-matching simulator address is not rewritten", () => {
  // complaint mailbox reported on a bounced@ send: not this alias's simulator.
  assert.equal(
    suppressionAddressFor("complaint@simulator.amazonses.com", "bounced@test.rootmail.dev"),
    "complaint@simulator.amazonses.com",
  );
  assert.equal(
    suppressionAddressFor("bounce@simulator.amazonses.com", "x@example.com"),
    "bounce@simulator.amazonses.com",
  );
});

test("ses-events maps both bounce and complaint recipients", () => {
  const src = readFileSync(new URL("./ses-events.ts", import.meta.url), "utf8");
  assert.match(src, /bouncedRecipients\?\.map\(\(r\) => suppressionAddressFor\(r\.emailAddress, message\.toEmail\)\)/);
  assert.match(src, /complainedRecipients\?\.map\(\(r\) => suppressionAddressFor\(r\.emailAddress, message\.toEmail\)\)/);
});
