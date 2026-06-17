import { cookies } from "next/headers";

// Deliberately distinct from the customer dashboard's `rm_session` cookie —
// staff sessions live in their own table and must never be confused with a
// customer session.
export const SESSION_COOKIE = "rm_staff_session";

const TWELVE_HOURS = 60 * 60 * 12;

/** The staff login token, read from the httpOnly cookie (server-only). */
export async function getStaffToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setStaffCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWELVE_HOURS,
  });
}

export async function clearStaffCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
