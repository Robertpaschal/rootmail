import "server-only";
import { createSign } from "node:crypto";

// Apple "Sign in with Apple" specifics. Unlike Google/GitHub, Apple's
// client_secret is a short-lived ES256 JWT signed with your .p8 key, the user's
// profile comes from the returned id_token (no userinfo endpoint), and the
// callback is an HTTP form_post. Lights up only when all four creds are set.
//
// Required env (apps/dashboard/.env.local):
//   APPLE_CLIENT_ID    — the Services ID (e.g. io.gateml.signin)
//   APPLE_TEAM_ID      — your Apple Developer Team ID
//   APPLE_KEY_ID       — the Key ID of the .p8 signing key
//   APPLE_PRIVATE_KEY  — the .p8 contents (PKCS8 PEM; \n-escaped is fine)

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function appleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY,
  );
}

/**
 * Build Apple's client_secret: an ES256 JWT (iss=Team ID, sub=Services ID,
 * aud=appleid.apple.com), signed with the .p8 key. JOSE needs the raw r||s
 * signature, hence dsaEncoding "ieee-p1363".
 */
export function appleClientSecret(): string {
  const teamId = process.env.APPLE_TEAM_ID as string;
  const keyId = process.env.APPLE_KEY_ID as string;
  const clientId = process.env.APPLE_CLIENT_ID as string;
  const privateKey = (process.env.APPLE_PRIVATE_KEY as string).replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 3600, // Apple allows up to 6 months; 1h per request is plenty
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

/**
 * Read the email/sub out of Apple's id_token. We don't verify the signature here
 * because the token was just fetched server-side, over TLS, from Apple's token
 * endpoint in exchange for our code (so it's already trusted). Verify against
 * Apple's JWKS only if you ever accept an id_token from the client.
 */
export function decodeAppleIdToken(idToken: string): {
  email?: string;
  emailVerified?: boolean;
  sub?: string;
} {
  const payloadB64 = idToken.split(".")[1];
  if (!payloadB64) return {};
  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    sub: typeof claims.sub === "string" ? claims.sub : undefined,
  };
}
