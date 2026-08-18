import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret, isEncrypted } from "./encryption";

// Secrets at rest (brief P2.1). The property that matters most is the LAST suite:
// this has to be deployable against a live table full of plaintext PEMs.

const PEM =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nEXAMPLEEXAMPLEEXAMPLE==\n-----END PRIVATE KEY-----\n";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a DKIM PEM exactly, newlines and all", () => {
    // A PEM that loses a trailing newline stops parsing as a key.
    assert.equal(decryptSecret(encryptSecret(PEM)), PEM);
  });

  it("round-trips unicode and empty strings", () => {
    for (const s of ["", "ünïcødé ✉️", "a".repeat(10_000)]) {
      assert.equal(decryptSecret(encryptSecret(s)), s);
    }
  });

  it("does not leave the plaintext visible in the stored value", () => {
    const enc = encryptSecret(PEM);
    assert.ok(!enc.includes("BEGIN PRIVATE KEY"));
    assert.ok(!enc.includes("EXAMPLE"));
  });

  it("produces different ciphertext each time (fresh nonce)", () => {
    // Deterministic ciphertext would leak which tenants share a key.
    assert.notEqual(encryptSecret(PEM), encryptSecret(PEM));
  });

  it("is tagged as encrypted", () => {
    assert.equal(isEncrypted(encryptSecret(PEM)), true);
  });

  it("is idempotent — encrypting twice does not nest", () => {
    const once = encryptSecret(PEM);
    assert.equal(encryptSecret(once), once);
    assert.equal(decryptSecret(once), PEM);
  });
});

describe("tamper detection", () => {
  it("rejects a modified ciphertext instead of returning garbage", () => {
    const enc = encryptSecret(PEM);
    const parts = enc.split(":");
    // Flip a character in the ciphertext segment.
    const data = parts[4] as string;
    parts[4] = (data[0] === "A" ? "B" : "A") + data.slice(1);
    assert.throws(() => decryptSecret(parts.join(":")));
  });

  it("rejects a modified auth tag", () => {
    const parts = encryptSecret(PEM).split(":");
    const tag = parts[3] as string;
    parts[3] = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    assert.throws(() => decryptSecret(parts.join(":")));
  });

  it("rejects a malformed encrypted value rather than passing it through", () => {
    // Passing it through would hand a caller ciphertext to sign mail with.
    assert.throws(() => decryptSecret("enc:v1:only:three"));
    assert.throws(() => decryptSecret("enc:v1:a:b:c:d:e"));
  });
});

describe("coexistence with plaintext — this must deploy before the backfill", () => {
  it("returns a plaintext PEM untouched", () => {
    assert.equal(decryptSecret(PEM), PEM);
  });

  it("does not mistake a PEM for ciphertext", () => {
    assert.equal(isEncrypted(PEM), false);
  });

  it("passes through any legacy value that is not tagged", () => {
    for (const s of ["", "plain", "enc", "enc:v0:x:y:z", "encrypted-looking-but-not"]) {
      assert.equal(decryptSecret(s), s);
    }
  });
});
