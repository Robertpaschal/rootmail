"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError, ConnectionError } from "@/lib/rootmail";
import { KEY_COOKIE } from "@/lib/session";

export interface ConnectState {
  error?: string;
}

export async function connect(
  _prev: ConnectState | null,
  formData: FormData,
): Promise<ConnectState> {
  const key = String(formData.get("apiKey") ?? "").trim();

  if (!key) return { error: "Enter an API key." };
  if (!key.startsWith("rm_live_") && !key.startsWith("rm_test_")) {
    return { error: "That doesn't look like a rootmail key (expected rm_live_… or rm_test_…)." };
  }

  try {
    await api.validateKey(key);
  } catch (err) {
    if (err instanceof ConnectionError) return { error: err.message };
    if (err instanceof ApiError) {
      if (err.status === 401) return { error: "That key was rejected. Double-check it and try again." };
      return { error: err.message };
    }
    return { error: "Something went wrong validating the key." };
  }

  (await cookies()).set(KEY_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}
