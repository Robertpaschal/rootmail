"use server";

import { redirect } from "next/navigation";
import { adminApi, ApiError, ConnectionError } from "@/lib/admin-api";
import { setStaffCookie } from "@/lib/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  try {
    const res = await adminApi.login({ email, password });
    await setStaffCookie(res.session_token);
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      return {
        error:
          err.status === 429
            ? "Too many attempts. Try again in a few minutes."
            : "Invalid email or password.",
      };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect("/");
}
