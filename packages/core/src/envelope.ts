import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { decryptSecret, isEncrypted } from "./encryption";
import { env } from "./env";

/**
 * Envelope encryption for tenant sending-provider credentials.
 *
 *   env:v1:<kid>:<wrapIv>:<wrapTag>:<wrappedDek>:<iv>:<tag>:<ciphertext>   (base64url parts)
 *
 * Each value gets its own random 256-bit data key (DEK). The DEK encrypts the
 * credential JSON; the key-encryption key (KEK, PROVIDER_CREDENTIALS_KEY) only
 * ever encrypts DEKs. Rotation re-wraps the DEK under a new KEK without touching
 * — or ever decrypting into a log — the credential itself. `kid` names which
 * KEK wrapped the DEK, so during a rotation window both keys can open rows.
 *
 * Legacy `enc:v1:` rows (single-key, ENCRYPTION_KEY) still open through
 * decryptSecret, so existing connections keep working untouched.
 */

const PREFIX = "env:v1:";
const KDF_SALT = "rootmail/provider-credentials/v1";

export interface Kek {
  kid: string;
  key: Buffer;
}

export function kekFrom(material: string): Kek {
  const key = scryptSync(material, KDF_SALT, 32);
  const kid = createHash("sha256").update(key).digest("hex").slice(0, 12);
  return { kid, key };
}

function keys(): { current: Kek | null; previous: Kek | null } {
  return {
    current: env.PROVIDER_CREDENTIALS_KEY ? kekFrom(env.PROVIDER_CREDENTIALS_KEY) : null,
    previous: env.PROVIDER_CREDENTIALS_KEY_PREVIOUS ? kekFrom(env.PROVIDER_CREDENTIALS_KEY_PREVIOUS) : null,
  };
}

export function isEnvelope(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

function gcm(key: Buffer, plain: Buffer): [Buffer, Buffer, Buffer] {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return [iv, c.getAuthTag(), ct];
}

function ungcm(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

const b = (x: Buffer) => x.toString("base64url");
const u = (x: string) => Buffer.from(x, "base64url");

/** Seal a credential. Throws if no KEK is configured — never falls back to a weaker key. */
export function sealCredentials(plaintext: string, kek: Kek | null = keys().current): string {
  if (!kek) {
    throw new Error("PROVIDER_CREDENTIALS_KEY is not set, so provider credentials cannot be stored.");
  }
  const dek = randomBytes(32);
  const [wIv, wTag, wDek] = gcm(kek.key, dek);
  const [iv, tag, ct] = gcm(dek, Buffer.from(plaintext, "utf8"));
  dek.fill(0);
  return `${PREFIX}${kek.kid}:${b(wIv)}:${b(wTag)}:${b(wDek)}:${b(iv)}:${b(tag)}:${b(ct)}`;
}

function parse(stored: string) {
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 7) throw new Error("Sealed credential is malformed.");
  const [kid, wIv, wTag, wDek, iv, tag, ct] = parts as [string, string, string, string, string, string, string];
  return { kid, wIv: u(wIv), wTag: u(wTag), wDek: u(wDek), iv: u(iv), tag: u(tag), ct: u(ct) };
}

function kekFor(kid: string, available: (Kek | null)[]): Kek {
  const k = available.find((x) => x?.kid === kid);
  if (!k) throw new Error(`No key with id ${kid} is configured (PROVIDER_CREDENTIALS_KEY / _PREVIOUS).`);
  return k;
}

/** Open a stored credential: envelope, legacy enc:v1, or (never in practice) plaintext. */
export function openCredentials(stored: string, available: (Kek | null)[] = Object.values(keys())): string {
  if (!isEnvelope(stored)) return decryptSecret(stored);
  const p = parse(stored);
  try {
    const dek = ungcm(kekFor(p.kid, available).key, p.wIv, p.wTag, p.wDek);
    const out = ungcm(dek, p.iv, p.tag, p.ct).toString("utf8");
    dek.fill(0);
    return out;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No key with id")) throw err;
    throw new Error("Could not open a sealed provider credential (wrong key or tampered value).");
  }
}

/**
 * Re-wrap under the current KEK. Envelope rows: only the DEK is re-encrypted.
 * Legacy enc:v1 rows are upgraded to an envelope. Already-current rows are
 * returned unchanged (idempotent), so the rotation script can be re-run.
 */
export function rewrapCredentials(
  stored: string,
  current: Kek | null = keys().current,
  available: (Kek | null)[] = Object.values(keys()),
): string {
  if (!current) throw new Error("PROVIDER_CREDENTIALS_KEY is not set.");
  if (!isEnvelope(stored)) {
    if (!isEncrypted(stored)) throw new Error("Refusing to re-wrap a value that is not encrypted.");
    return sealCredentials(decryptSecret(stored), current);
  }
  const p = parse(stored);
  if (p.kid === current.kid) return stored;
  const dek = ungcm(kekFor(p.kid, available).key, p.wIv, p.wTag, p.wDek);
  const [wIv, wTag, wDek] = gcm(current.key, dek);
  dek.fill(0);
  return `${PREFIX}${current.kid}:${b(wIv)}:${b(wTag)}:${b(wDek)}:${b(p.iv)}:${b(p.tag)}:${b(p.ct)}`;
}

/** A masked hint safe to show and store in plaintext: first 4 + last 4 of a key. */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
