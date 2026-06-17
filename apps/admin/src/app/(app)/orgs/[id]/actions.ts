"use server";

import { adminApi, ApiError } from "@/lib/admin-api";

const DASHBOARD_URL = process.env.ROOTMAIL_DASHBOARD_URL ?? "http://localhost:3001";

/** Mint a one-time impersonation handoff and return the dashboard URL to open. */
export async function createImpersonationLink(
  userId: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const { code } = await adminApi.impersonate(userId);
    return { url: `${DASHBOARD_URL}/impersonate?code=${encodeURIComponent(code)}` };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Your staff role can't impersonate." };
    }
    return { error: "Couldn't start impersonation. Please try again." };
  }
}
