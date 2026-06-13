"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/rootmail";
import { clearSessionCookie } from "@/lib/session";

export async function signOut() {
  // Best-effort server-side session invalidation, then drop the cookie.
  try {
    await api.logout();
  } catch {
    // Even if the API call fails, clear the cookie so the user is signed out locally.
  }
  await clearSessionCookie();
  redirect("/login");
}
