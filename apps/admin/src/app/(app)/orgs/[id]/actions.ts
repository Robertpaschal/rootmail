"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";

const DASHBOARD_URL = process.env.ROOTMAIL_DASHBOARD_URL ?? "http://localhost:3001";

/** Clear a suppression and refresh the org page. Form action. */
export async function clearSuppression(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  if (!id) return;
  await adminApi.clearSuppression(id);
  if (orgId) revalidatePath(`/orgs/${orgId}`);
}

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
