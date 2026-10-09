import assert from "node:assert/strict";
import { test } from "node:test";
import { betaSenderAddress, isPlatformBetaAddress } from "./constants";

test("recognises only rootmail-minted beta addresses on the given domain", () => {
  const minted = betaSenderAddress("org_ABC123", "rootmail.io");
  assert.equal(minted, "beta+org_abc123@rootmail.io");
  assert.equal(isPlatformBetaAddress(minted, "rootmail.io"), true);
  assert.equal(isPlatformBetaAddress(" BETA+org_abc123@RootMail.io ", "rootmail.io"), true);
  for (const e of ["beta+@rootmail.io", "beta@rootmail.io", "beta+org@rootmail.io.evil.example", "beta+org@evil-rootmail.io", "beta+a@b@rootmail.io", "hello@rootmail.io", "", null, undefined]) {
    assert.equal(isPlatformBetaAddress(e, "rootmail.io"), false, String(e));
  }
});
