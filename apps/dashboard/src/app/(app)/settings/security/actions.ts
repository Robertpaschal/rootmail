"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { ApiError, api } from "@/lib/rootmail";

export interface MfaActionState {
  error?: string;
  recoveryCodes?: string[];
  disabled?: boolean;
}

/** Begin enrollment: reserve a TOTP secret and render its otpauth URI as a QR. */
export async function startMfaSetup(): Promise<
  { secret: string; otpauth_uri: string; qr: string } | { error: string }
> {
  try {
    const { secret, otpauth_uri } = await api.mfaSetup();
    const qr = await QRCode.toDataURL(otpauth_uri, { margin: 1, width: 200 });
    return { secret, otpauth_uri, qr };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { error: "MFA is already enabled." };
    return { error: "Couldn't start setup. Try again." };
  }
}

export async function activateMfa(
  _prev: MfaActionState | null,
  formData: FormData,
): Promise<MfaActionState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your app." };
  try {
    const res = await api.mfaActivate(code);
    // Don't revalidate here — the client needs to keep rendering the one-time
    // recovery codes we just returned. The next navigation reflects enabled=true.
    return { recoveryCodes: res.recovery_codes };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return { error: "That code didn't match. Check your app and try again." };
    }
    return { error: "Couldn't enable two-factor. Try again." };
  }
}

export async function disableMfa(
  _prev: MfaActionState | null,
  formData: FormData,
): Promise<MfaActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!code && !password) return { error: "Enter a current code or your password." };
  try {
    await api.mfaDisable({ code: code || undefined, password: password || undefined });
    revalidatePath("/settings/security");
    return { disabled: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { error: "Couldn't verify — check your code or password." };
    }
    return { error: "Couldn't disable two-factor. Try again." };
  }
}
