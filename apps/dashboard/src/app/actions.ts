"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/rootmail";
import { clearSessionCookie } from "@/lib/session";

/**
 * Sign out of EVERYTHING on this browser.
 *
 * Its one remaining caller is the impersonation banner's "stop impersonating",
 * and total is the correct meaning there: an impersonated session deliberately
 * replaces the whole account roster (see app/impersonate/route.ts), so there is
 * nothing else in it to preserve. Ordinary sign-out is
 * `signOutAccount` in components/app/account-actions.ts, which ends only the
 * account in use and leaves the others signed in.
 */
export async function signOut() {
  // Best-effort server-side session invalidation, then drop the cookies.
  try {
    await api.logout();
  } catch {
    // Even if the API call fails, clear the cookie so the user is signed out locally.
  }
  await clearSessionCookie();
  redirect("/login");
}
