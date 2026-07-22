import { cookies } from "next/headers";

export const SESSION_COOKIE = "rm_session";
// A non-secret "there's a session on the dashboard host" hint, scoped to the
// PARENT domain (COOKIE_DOMAIN, e.g. .gateml.io) so the marketing + developer
// sites can reflect the signed-in state and drop the "Sign in" wall. Carries no
// token — the real session cookie stays httpOnly + host-only. Local dev leaves
// COOKIE_DOMAIN unset: on localhost the cookie is shared across ports anyway.
export const SIGNED_IN_HINT = "rm_signed_in";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

/** The dashboard login session token, read from the httpOnly cookie (server-only). */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  store.set(SIGNED_IN_HINT, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
    domain: cookieDomain,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  // Delete the cross-domain hint with the SAME domain it was written on, or the
  // browser keeps it (a delete only matches on name+domain+path).
  store.set(SIGNED_IN_HINT, "", { path: "/", maxAge: 0, domain: cookieDomain });
}
