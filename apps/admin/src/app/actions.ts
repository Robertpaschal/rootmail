"use server";

import { redirect } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { clearStaffCookie } from "@/lib/session";

export async function logout() {
  try {
    await adminApi.logout();
  } catch {
    // best-effort server-side revocation; clear the cookie regardless
  }
  await clearStaffCookie();
  redirect("/login");
}
