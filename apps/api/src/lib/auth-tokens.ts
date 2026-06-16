import { eq } from "drizzle-orm";
import { newId, randomToken, sha256Hex } from "@rootmail/core";
import { authTokens, db } from "@rootmail/db";

// Single-use, expiring tokens for email verification and password reset. Only
// the SHA-256 hash is stored; the raw token travels in the emailed link.

export type AuthTokenPurpose = "email_verify" | "password_reset";

/** Mint a token for `purpose`, store its hash, and return the raw token. */
export async function createAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  ttlMs: number,
): Promise<string> {
  const token = randomToken(32);
  await db.insert(authTokens).values({
    id: newId("authToken"),
    userId,
    purpose,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/** Validate and consume a token (one-time). Returns the userId, or null if the
 * token is unknown, the wrong purpose, already used, or expired. */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}
