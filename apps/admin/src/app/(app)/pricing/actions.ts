"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { PlanPatch } from "@/lib/types";

export type PlanState = { ok?: boolean; error?: string };

export async function updatePlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing plan." };

  const intField = (k: string): number | undefined => {
    const v = formData.get(k);
    if (v === null || String(v).trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  };
  const priceRaw = formData.get("price");
  const patch: PlanPatch = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    // Empty price = custom / contact-sales (null).
    price:
      priceRaw === null || String(priceRaw).trim() === "" ? null : Math.trunc(Number(priceRaw)),
    monthly_quota: intField("monthly_quota"),
    overage_per_1000_cents: intField("overage_per_1000_cents"),
    included_sub_tenants: intField("included_sub_tenants"),
    seats: intField("seats"),
    ai_credits: intField("ai_credits"),
    active: formData.get("active") === "on",
  };

  try {
    await adminApi.updatePlan(id, patch);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    return { error: "Couldn't save — check the values." };
  }
  revalidatePath("/pricing");
  return { ok: true };
}
