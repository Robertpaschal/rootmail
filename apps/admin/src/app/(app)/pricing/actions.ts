"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { AddonPatch, PlanPatch } from "@/lib/types";

export type PlanState = { ok?: boolean; error?: string; sync?: string };

function intField(formData: FormData, k: string): number | undefined {
  const v = formData.get(k);
  if (v === null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export async function updatePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing plan." };

  const priceRaw = formData.get("price");
  const patch: PlanPatch = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    // Empty price = custom / contact-sales (null).
    price:
      priceRaw === null || String(priceRaw).trim() === "" ? null : Math.trunc(Number(priceRaw)),
    monthly_quota: intField(formData, "monthly_quota"),
    overage_per_1000_cents: intField(formData, "overage_per_1000_cents"),
    included_sub_tenants: intField(formData, "included_sub_tenants"),
    seats: intField(formData, "seats"),
    ai_credits: intField(formData, "ai_credits"),
    trial_days: intField(formData, "trial_days"),
    active: formData.get("active") === "on",
  };

  let sync: string | undefined;
  try {
    const res = await adminApi.updatePlan(id, patch);
    sync = res.stripe_sync;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    return { error: "Couldn't save — check the values." };
  }
  revalidatePath("/pricing");
  return { ok: true, sync };
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
