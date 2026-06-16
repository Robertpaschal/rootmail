"use server";

import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { setSessionCookie } from "@/lib/session";

export interface AuthState {
  error?: string;
  /** Set when login needs a second factor; carries the short-lived challenge. */
  mfaRequired?: boolean;
  mfaToken?: string;
  /** Set by forgot-password so the form can show a "check your inbox" message. */
  sent?: boolean;
}

export async function login(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  let result;
  try {
    result = await api.login({ email, password });
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      if (err.status === 429) return { error: "Too many attempts. Try again in a few minutes." };
      return { error: err.status === 401 ? "Invalid email or password." : err.message };
    }
    return { error: "Something went wrong signing in." };
  }

  // MFA enabled → hand the challenge to the client; no session yet.
  if ("mfa_required" in result) {
    return { mfaRequired: true, mfaToken: result.mfa_token };
  }

  await setSessionCookie(result.session_token);
  redirect("/");
}

export async function verifyMfa(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const mfaToken = String(formData.get("mfa_token") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const recoveryCode = String(formData.get("recovery_code") ?? "").trim();
  if (!mfaToken) return { error: "Your sign-in expired. Please start over." };
  if (!code && !recoveryCode) {
    return { error: "Enter your authenticator code.", mfaRequired: true, mfaToken };
  }

  let session;
  try {
    session = await api.mfaVerify({
      mfa_token: mfaToken,
      code: code || undefined,
      recovery_code: recoveryCode || undefined,
    });
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message, mfaRequired: true, mfaToken };
    if (err instanceof ApiError && err.status === 429) {
      return { error: "Too many attempts. Try again in a few minutes.", mfaRequired: true, mfaToken };
    }
    return { error: "That code didn't match. Try again.", mfaRequired: true, mfaToken };
  }

  await setSessionCookie(session.session_token);
  redirect("/");
}

export async function signup(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const organizationName = String(formData.get("organization_name") ?? "").trim();

  if (!email) return { error: "Email is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  let token: string;
  try {
    token = (
      await api.signup({
        email,
        password,
        name: name || undefined,
        organization_name: organizationName || undefined,
      })
    ).session_token;
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      return { error: err.status === 409 ? "An account with that email already exists." : err.message };
    }
    return { error: "Something went wrong creating your account." };
  }

  await setSessionCookie(token);
  // Land new users on API keys so they can grab a key immediately.
  redirect("/api-keys");
}

export async function forgotPassword(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email." };
  try {
    await api.forgotPassword(email);
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    // Any other error is swallowed: the endpoint never reveals whether the
    // address is registered, and neither should we.
  }
  return { sent: true };
}

export async function resetPassword(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token) return { error: "This reset link is invalid." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    await api.resetPassword({ token, password });
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      return { error: err.status === 400 ? "This reset link is invalid or has expired." : err.message };
    }
    return { error: "Something went wrong resetting your password." };
  }

  redirect("/login?reset=1");
}

/** Resend the verification email to the signed-in user (used by the banner). */
export async function resendVerification(): Promise<{ sent?: boolean; error?: string }> {
  try {
    await api.resendVerification();
    return { sent: true };
  } catch {
    return { error: "Couldn't resend right now — try again in a moment." };
  }
}
