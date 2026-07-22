"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";

const DASHBOARD_URL = process.env.ROOTMAIL_DASHBOARD_URL ?? "http://localhost:3001";

export type CreditState = { ok?: boolean; error?: string };

/** Move an org's dedicated-IP provisioning through requested → active. */
export async function setDedicatedIp(
  orgId: string,
  status: "none" | "requested" | "active",
  address: string | null,
  configSet: string | null = null,
): Promise<{ error?: string }> {
  try {
    await adminApi.setDedicatedIp(orgId, status, address, configSet);
    revalidatePath(`/orgs/${orgId}`);
    return {};
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Couldn't update the dedicated IP." };
  }
}

/** Activate (or revert) an org's branded reply domain once the SES receipt rule exists. */
export async function setReplyDomainStatus(
  orgId: string,
  status: "none" | "pending" | "active",
): Promise<{ error?: string }> {
  try {
    await adminApi.setReplyDomainStatus(orgId, status);
    revalidatePath(`/orgs/${orgId}`);
    return {};
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "Couldn't update the reply domain." };
  }
}

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

export type CustomPlanState = { ok?: boolean; error?: string; stripeSync?: string };

/** Create/update an org's bespoke enterprise plan (superadmin). useActionState. */
export async function saveCustomPlan(
  _prev: CustomPlanState,
  formData: FormData,
): Promise<CustomPlanState> {
  const orgId = String(formData.get("orgId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const price = Number.parseFloat(String(formData.get("price") ?? ""));
  const interval = String(formData.get("interval") ?? "month") === "year" ? "year" : "month";
  const monthlyQuota = Number(formData.get("monthly_quota"));
  const allowOverage = formData.get("allow_overage") != null; // checkbox present = on
  const overage = Number.parseFloat(String(formData.get("overage_per_1000") ?? "0"));
  const subtenants = Number(formData.get("included_sub_tenants"));
  const seats = Number(formData.get("seats"));
  const aiCredits = Number(formData.get("ai_credits"));
  const leadId = String(formData.get("lead_id") ?? "").trim() || undefined;

  if (!orgId) return { error: "Missing organization." };
  if (!name) return { error: "Give the plan a name." };
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a valid monthly/annual price." };
  if (!Number.isInteger(monthlyQuota) || monthlyQuota < 0) {
    return { error: "Enter the included monthly email quota." };
  }

  try {
    const res = await adminApi.saveCustomPlan(orgId, {
      name,
      price_cents: Math.round(price * 100),
      interval: interval as "month" | "year",
      monthly_quota: monthlyQuota,
      allow_overage: allowOverage,
      overage_per_1000_cents: Number.isFinite(overage) ? Math.round(overage * 100) : 0,
      included_sub_tenants: Number.isFinite(subtenants) ? subtenants : -1,
      seats: Number.isFinite(seats) ? seats : -1,
      ai_credits: Number.isFinite(aiCredits) ? aiCredits : -1,
      lead_id: leadId,
    });
    revalidatePath(`/orgs/${orgId}`);
    return { ok: true, stripeSync: res.stripe_sync };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't save the custom plan." };
    return { error: "Couldn't save the custom plan." };
  }
}

export type BillState = { ok?: boolean; error?: string; subscriptionId?: string };

/** Provision a send-invoice subscription for the custom plan. useActionState. */
export async function billCustomPlan(_prev: BillState, formData: FormData): Promise<BillState> {
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { error: "Missing organization." };
  try {
    const res = await adminApi.billCustomPlan(orgId);
    revalidatePath(`/orgs/${orgId}`);
    return { ok: true, subscriptionId: res.subscription_id };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't provision billing." };
    return { error: "Couldn't provision billing." };
  }
}

/** Deactivate the custom plan (org reverts to standard enterprise). Form action. */
export async function deactivateCustomPlan(formData: FormData): Promise<void> {
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return;
  await adminApi.deactivateCustomPlan(orgId);
  revalidatePath(`/orgs/${orgId}`);
}
