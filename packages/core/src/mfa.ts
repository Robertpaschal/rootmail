import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hmacSign } from "./crypto";
import { env } from "./env";

// ---------------------------------------------------------------------------
// TOTP (RFC 6238 / HOTP RFC 4226) — dependency-free, via node:crypto. Used for
// first-party MFA: an authenticator app holds the base32 secret; we verify the
// 6-digit code with a ±1 step (30s) window for clock drift.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Fresh 160-bit base32 secret to seed an authenticator app. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** The current 6-digit TOTP for a secret (`atMs` overridable for testing). */
export function totpToken(secretB32: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secretB32), Math.floor(atMs / 1000 / 30));
}

/** Verify a code against the secret within ±`window` 30s steps. */
export function verifyTotp(secretB32: string, code: string, window = 1, atMs = Date.now()): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(atMs / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, step + w);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

/** otpauth:// URI for an authenticator QR code. */
export function totpUri(secretB32: string, account: string, issuer = "rootmail"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** A single human-friendly recovery code, e.g. `a3f9k-2m8qd`. */
export function generateRecoveryCode(): string {
  const raw = base32Encode(randomBytes(8)).toLowerCase().slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

// ---------------------------------------------------------------------------
// MFA challenge token — short-lived proof that the password step passed, handed
// to the client between login and the TOTP step (stateless, HMAC-signed).
// ---------------------------------------------------------------------------
const CHALLENGE_TTL_SECONDS = 5 * 60;

function challengeSecret(): string {
  return env.LINK_SIGNING_SECRET ?? "dev-insecure-mfa-challenge-secret";
}

export function signMfaChallenge(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${hmacSign(payload, challengeSecret())}`;
}

export function verifyMfaChallenge(token: string): string | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString("utf8");
  if (hmacSign(payload, challengeSecret()) !== sig) return null;
  const [userId, expStr] = payload.split(".");
  if (!userId || !expStr) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}
