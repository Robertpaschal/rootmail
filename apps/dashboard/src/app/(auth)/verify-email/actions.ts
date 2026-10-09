"use server";

import { api } from "@/lib/rootmail";

export type VerifyState = { status?: "verified" | "failed" };

/**
 * Consume the email-verification token. A POST from a button, never on page
 * load: mail scanners and link previewers fetch links but do not submit forms,
 * so a single-use token is spent only by the person who clicked. Touches no
 * cookie — whatever session this browser has is left exactly as it was.
 */
export async function confirmEmail(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  const token = String(form.get("token") ?? "");
  if (!token) return { status: "failed" };
  try {
    await api.verifyEmail(token);
    return { status: "verified" };
  } catch {
    return { status: "failed" };
  }
}
