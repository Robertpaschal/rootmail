"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { AddonPatch, TierPatch } from "@/lib/types";

export type PlanState = { ok?: boolean; error?: string; sync?: string };

function intField(formData: FormData, k: string): number | undefined {
  const v = formData.get(k);
  if (v === null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/** Edit a per-wing pricing tier — THE live model (blocks / contact-size). */
export async function updateTier(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing tier." };

  const patch: TierPatch = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    ai_credits: intField(formData, "ai_credits"),
    overage_per_1000_cents: intField(formData, "overage_per_1000_cents"),
    per_thousand_cents: intField(formData, "per_thousand_cents"),
    sends_per_contact: intField(formData, "sends_per_contact"),
    daily_per_contact: intField(formData, "daily_per_contact"),
    included_audiences: intField(formData, "included_audiences"),
    seats: intField(formData, "seats"),
    workspace_limit: intField(formData, "workspace_limit"),
  };
  const priceRaw = formData.get("price_monthly");
  if (priceRaw !== null) {
    patch.price_monthly = String(priceRaw).trim() === "" ? null : Math.trunc(Number(priceRaw));
  }

  let sync: string | undefined;
  try {
    const res = await adminApi.updatePricingTier(id, patch);
    sync = res.stripe_sync;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    return { error: "Couldn't save — check the values." };
  }
  revalidatePath("/pricing");
  return { ok: true, sync };
}

export async function setAddonSale(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing add-on." };
  const pct = Number(formData.get("percent_off"));
  if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
    return { error: "Enter a discount between 1 and 90%." };
  }
  const endsAt = String(formData.get("ends_at") ?? "").trim();
  let sync: string | undefined;
  try {
    const res = await adminApi.setAddonSale(id, {
      percent_off: Math.trunc(pct),
      ends_at: endsAt || undefined,
    });
    sync = res.stripe_sync;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't start the sale." };
    return { error: "Couldn't start the sale." };
  }
  revalidatePath("/pricing");
  return { ok: true, sync };
}

export async function clearAddonSale(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminApi.clearAddonSale(id);
  revalidatePath("/pricing");
}

/** End a custom plan from the central list (reverts the org to standard economics). */
export async function deactivateCustomPlan(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org_id") ?? "");
  if (!orgId) return;
  await adminApi.deactivateCustomPlan(orgId).catch(() => undefined);
  revalidatePath("/pricing");
}

export async function updateAddon(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing add-on." };

  const patch: AddonPatch = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    unit_amount: intField(formData, "unit_amount"),
    grant: intField(formData, "grant"),
    active: formData.get("active") === "on",
  };

  let sync: string | undefined;
  try {
    const res = await adminApi.updateAddon(id, patch);
    sync = res.stripe_sync;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    return { error: "Couldn't save — check the values." };
  }
  revalidatePath("/pricing");
  return { ok: true, sync };
}
