"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";

export type PromoState = { ok?: boolean; error?: string };

export async function createPromotion(_prev: PromoState, formData: FormData): Promise<PromoState> {
  const code = String(formData.get("code") ?? "").trim();
  const type = String(formData.get("type") ?? "percent") === "amount" ? "amount" : "percent";
  const value = Number(formData.get("value"));
  const durationRaw = String(formData.get("duration") ?? "once");
  const duration = (["once", "repeating", "forever"].includes(durationRaw) ? durationRaw : "once") as
    | "once"
    | "repeating"
    | "forever";
  const dim = formData.get("duration_in_months");
  const maxr = formData.get("max_redemptions");

  if (!code) return { error: "Enter a code." };
  if (!Number.isFinite(value) || value <= 0) return { error: "Enter a positive value." };

  try {
    await adminApi.createPromotion({
      code,
      type,
      value,
      duration,
      duration_in_months: duration === "repeating" && dim ? Number(dim) : undefined,
      max_redemptions: maxr && String(maxr).trim() !== "" ? Number(maxr) : undefined,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't create the promotion." };
    return { error: "Couldn't create the promotion." };
  }
  revalidatePath("/promotions");
  return { ok: true };
}

export async function deactivatePromotion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminApi.deactivatePromotion(id);
  revalidatePath("/promotions");
}
