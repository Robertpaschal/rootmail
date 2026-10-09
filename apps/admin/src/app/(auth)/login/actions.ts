"use server";

import { redirect } from "next/navigation";
import { adminApi, ApiError, ConnectionError } from "@/lib/admin-api";
import { clearStaffCookie, setStaffCookie } from "@/lib/session";

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

export type ForgotState = { message?: string; error?: string };

/** Ask for a reset link. Shows the API's neutral answer — the same for every address. */
export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your staff email." };
  try {
    const res = await adminApi.forgotPassword({ email });
    return { message: res.message };
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError && err.status === 429) return { error: "Too many reset requests. Try again later." };
    if (err instanceof ApiError && err.status === 422) return { error: "That doesn't look like an email address." };
    return { error: "Something went wrong. Please try again." };
  }
}

export type ResetState = { error?: string };

/** Spend a reset link and set the new password, then back to sign in. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "This reset link is incomplete. Ask for a new one." };
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password.length > 200) return { error: "Use at most 200 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  try {
    await adminApi.resetPassword({ token, password });
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError && err.status === 429) return { error: "Too many attempts. Try again later." };
    if (err instanceof ApiError && err.status === 422) return { error: "Use between 10 and 200 characters." };
    return { error: "This reset link is invalid or has expired. Ask for a new one." };
  }
  // Every staff session was signed out by the reset, this browser's included.
  await clearStaffCookie();
  redirect("/login?reset=1");
}
