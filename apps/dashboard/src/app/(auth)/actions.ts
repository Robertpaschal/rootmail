"use server";

import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { setSessionCookie } from "@/lib/session";

export interface AuthState {
  error?: string;
}

export async function login(_prev: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  let token: string;
  try {
    token = (await api.login({ email, password })).session_token;
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      return { error: err.status === 401 ? "Invalid email or password." : err.message };
    }
    return { error: "Something went wrong signing in." };
  }

  await setSessionCookie(token);
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
