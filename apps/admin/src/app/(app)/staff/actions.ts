"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { StaffRole, StaffUser } from "@/lib/types";

type Result<T> = { data?: T; error?: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/staff");
    return { data };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Something went wrong." };
  }
}

export async function createStaffAction(input: {
  email: string;
  name?: string;
  role: StaffRole;
}): Promise<Result<{ staff: StaffUser; generated_password?: string }>> {
  if (!input.email.trim()) return { error: "Enter an email." };
  return run(() => adminApi.createStaff({ email: input.email.trim(), name: input.name?.trim() || undefined, role: input.role }));
}

export async function setStaffRoleAction(id: string, role: StaffRole): Promise<Result<StaffUser>> {
  return run(() => adminApi.updateStaff(id, { role }));
}

export async function deactivateStaffAction(id: string): Promise<Result<StaffUser>> {
  return run(() => adminApi.deactivateStaff(id));
}

export async function reactivateStaffAction(id: string): Promise<Result<StaffUser>> {
  return run(() => adminApi.reactivateStaff(id));
}

export async function resetStaffPasswordAction(id: string): Promise<Result<{ generated_password: string }>> {
  return run(() => adminApi.resetStaffPassword(id));
}
