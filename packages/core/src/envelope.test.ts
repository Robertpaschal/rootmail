import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encryptSecret } from "./encryption";
import { isEnvelope, kekFrom, maskSecret, openCredentials, rewrapCredentials, sealCredentials } from "./envelope";

const OLD = kekFrom("old-key-material-0123456789abcdef");
const NEW = kekFrom("new-key-material-fedcba9876543210");
const CREDS = JSON.stringify({ accessKeyId: "AKIAEXAMPLE1234567", secretAccessKey: "s3cr3t/value+with=chars" });

describe("envelope encryption for provider credentials", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = sealCredentials(CREDS, OLD);
    assert.equal(isEnvelope(sealed), true);
    assert.equal(sealed.includes("s3cr3t"), false);
    assert.equal(sealed.includes("AKIA"), false);
    assert.equal(openCredentials(sealed, [OLD]), CREDS);
  });
  it("uses a fresh data key every time", () => {
    assert.notEqual(sealCredentials(CREDS, OLD), sealCredentials(CREDS, OLD));
  });
  it("refuses to store without a key, never falling back to a weaker one", () => {
    assert.throws(() => sealCredentials(CREDS, null), /PROVIDER_CREDENTIALS_KEY is not set/);
  });
  it("detects tampering", () => {
    const parts = sealCredentials(CREDS, OLD).split(":");
    const last = parts.length - 1;
    parts[last] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => openCredentials(parts.join(":"), [OLD]), /Could not open/);
  });
  it("names the missing key without revealing anything", () => {
    assert.throws(() => openCredentials(sealCredentials(CREDS, OLD), [NEW]), /No key with id/);
  });
  it("rotates: re-wraps only the data key, then opens with the new key alone", () => {
    const sealed = sealCredentials(CREDS, OLD);
    const rotated = rewrapCredentials(sealed, NEW, [NEW, OLD]);
    assert.notEqual(rotated, sealed);
    assert.ok(rotated.includes(`:${NEW.kid}:`));
    // ciphertext of the credential itself is unchanged by a rotation
    assert.equal(rotated.split(":").slice(-3).join(":"), sealed.split(":").slice(-3).join(":"));
    assert.equal(openCredentials(rotated, [NEW]), CREDS);
    assert.equal(rewrapCredentials(rotated, NEW, [NEW]), rotated, "idempotent");
  });
  it("still opens legacy enc:v1 rows unchanged (existing connections keep working)", () => {
    const legacy = encryptSecret(CREDS);
    assert.equal(isEnvelope(legacy), false);
    assert.equal(openCredentials(legacy, []), CREDS);
    assert.equal(openCredentials(rewrapCredentials(legacy, NEW, [NEW]), [NEW]), CREDS);
  });
  it("masks secrets to a hint", () => {
    assert.equal(maskSecret("AKIAEXAMPLE1234567"), "AKIA…4567");
    assert.equal(maskSecret("short"), "••••");
  });
});
