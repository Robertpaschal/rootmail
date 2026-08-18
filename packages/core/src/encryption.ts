import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "./env";

/**
 * Authenticated symmetric encryption for secrets at rest.
 *
 * The motivating case is `sub_tenants.dkim_private_key`, whose own schema comment
 * has said "must be encrypted at rest / KMS-managed in production" since it was
 * written. Until now it was not: a database dump handed over every tenant's
 * signing key, and anyone holding one can sign mail as that tenant's domain
 * indefinitely — DKIM keys have no expiry and, without rotation, no revocation.
 *
 * AES-256-GCM, not CBC or raw CTR: the tag makes tampering a decrypt failure
 * rather than silent corruption, which for a PEM would surface as an inscrutable
 * signing error at send time.
 *
 * ── FORMAT ─────────────────────────────────────────────────────────────────
 *   enc:v1:<iv>:<tag>:<ciphertext>      (each part base64url)
 *
 * The prefix is what makes this deployable against a live database. Existing rows
 * hold plaintext PEMs; `decryptSecret` returns anything without the prefix
 * unchanged, so the two coexist and the backfill can run whenever. A PEM always
 * starts "-----BEGIN", so it can never be mistaken for ciphertext.
 *
 * ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
 * This protects against a stolen dump, a leaked backup, a misconfigured replica —
 * the realistic exposures. It does NOT protect against an attacker who already
 * has the application's environment, because the key is there. Real KMS (the key
 * never in process memory, decryption as an audited API call) is the next step
 * and this interface is deliberately shaped to allow it: every caller goes
 * through encryptSecret/decryptSecret and none of them knows the algorithm.
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

/**
 * A fixed salt, deliberately.
 *
 * The input is already a high-entropy 32-byte secret, so the salt is not doing
 * password-stretching work — scrypt here only maps an arbitrary-length env string
 * onto a 32-byte key. A random salt would have to be stored beside every value
 * and would make the key non-deterministic, which is worse for no gain.
 */
const KDF_SALT = "rootmail/encryption/v1";

let cachedKey: Buffer | undefined;
let warned = false;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;

  let material = env.ENCRYPTION_KEY;
  if (!material) {
    // Local development must not need setup. Derived from a constant, so it is
    // NOT a secret — hence the warning, once, loudly.
    if (!warned) {
      warned = true;
      console.warn(
        "[encryption] ENCRYPTION_KEY is not set — using a dev-only key derived from a constant. " +
          "Secrets at rest are NOT protected. Set ENCRYPTION_KEY in production (openssl rand -base64 32).",
      );
    }
    material = "rootmail-development-only-encryption-key";
  }

  cachedKey = scryptSync(material, KDF_SALT, KEY_BYTES);
  return cachedKey;
}

/** True if a stored value is already ciphertext from this module. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a secret for storage. Encrypting twice is a no-op, not nested. */
export function encryptSecret(plaintext: string): string {
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1), // "enc:v1"
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a stored secret.
 *
 * A value that was never encrypted is returned as-is — that is what lets this
 * ship before the backfill has run, and what keeps a half-migrated table working.
 * A value that IS tagged as ciphertext but fails to decrypt throws: silently
 * returning the raw string would hand a caller ciphertext to sign mail with, and
 * they would have no way to tell.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const parts = stored.split(":");
  // enc : v1 : iv : tag : ciphertext
  if (parts.length !== 5) {
    throw new Error("Encrypted value is malformed — wrong number of segments.");
  }
  const [, , ivB64, tagB64, dataB64] = parts as [string, string, string, string, string];

  try {
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Almost always a changed ENCRYPTION_KEY. Say so, because the alternative is
    // someone debugging DKIM signatures for a day.
    throw new Error(
      "Could not decrypt a stored secret. This usually means ENCRYPTION_KEY changed or differs " +
        "between processes — values encrypted with the old key cannot be recovered without it.",
    );
  }
}
