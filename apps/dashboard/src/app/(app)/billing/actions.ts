"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/rootmail";

export async function changePlan(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "");
  if (!plan) return;
  try {
    await api.setPlan(plan);
  } catch {
    // Best-effort; the page reflects the current plan.
  }
  revalidatePath("/billing");
  revalidatePath("/");
}
