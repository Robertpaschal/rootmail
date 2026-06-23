"use server";

import { redirect } from "next/navigation";
import { adminApi, ApiError, ConnectionError } from "@/lib/admin-api";

export type BootstrapState = { error?: string };

export async function bootstrapAction(_prev: BootstrapState, formData: FormData): Promise<BootstrapState> {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const secret = String(formData.get("secret") ?? "");
  if (!email || !password || !secret) return { error: "Email, password, and bootstrap secret are required." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };

  try {
    await adminApi.bootstrap({ email, name: name || undefined, password, secret });
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      if (err.status === 409) return { error: "Setup is already complete — a staff account exists. Sign in instead." };
      if (err.status === 401) return { error: "Invalid bootstrap secret." };
      return { error: "Couldn't complete setup. Please try again." };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect("/login");
}
