"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";

const DASHBOARD_URL = process.env.ROOTMAIL_DASHBOARD_URL ?? "http://localhost:3001";

export type CreditState = { ok?: boolean; error?: string };

/** Grant a goodwill account credit (superadmin only). */
export async function grantCredit(_prev: CreditState, formData: FormData): Promise<CreditState> {
  const orgId = String(formData.get("orgId") ?? "");
  const dollars = Number.parseFloat(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!orgId || !Number.isFinite(dollars) || dollars < 0.01) {
    return { error: "Enter a valid dollar amount." };
  }
  try {
    await adminApi.grantCredit(orgId, Math.round(dollars * 100), reason);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Only superadmins can grant credits." };
    }
    if (err instanceof ApiError && err.status === 400) {
      return { error: "This org has no Stripe customer to credit." };
    }
    return { error: "Couldn't apply the credit. Please try again." };
  }
  revalidatePath(`/orgs/${orgId}`);
  return { ok: true };
}

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
