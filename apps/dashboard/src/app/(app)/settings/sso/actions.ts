"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SsoConnectionInput } from "@/lib/types";

export type SsoState = { ok?: boolean; error?: string };

export async function saveSsoConnection(_prev: SsoState, formData: FormData): Promise<SsoState> {
  const input: SsoConnectionInput = {
    email_domain: String(formData.get("email_domain") ?? "").trim().toLowerCase(),
    idp_entity_id: String(formData.get("idp_entity_id") ?? "").trim(),
    idp_sso_url: String(formData.get("idp_sso_url") ?? "").trim(),
    idp_certificate: String(formData.get("idp_certificate") ?? "").trim(),
    default_role: (String(formData.get("default_role") ?? "member") === "admin"
      ? "admin"
      : "member") as "admin" | "member",
    enforced: formData.get("enforced") === "on",
    active: formData.get("active") !== "off",
  };
  if (!input.email_domain || !input.idp_entity_id || !input.idp_sso_url || !input.idp_certificate) {
    return { error: "Fill in the domain, IdP entity ID, sign-in URL, and certificate." };
  }
  try {
    await api.putSsoConnection(input);
    revalidatePath("/settings/sso");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save the SSO connection." };
  }
}

export async function deleteSsoConnection(): Promise<{ error?: string }> {
  try {
    await api.deleteSsoConnection();
    revalidatePath("/settings/sso");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't remove the SSO connection." };
  }
}

// SCIM provisioning: the token is returned once, here — never stored client-side.
export async function enableScim(): Promise<{ token?: string; base_url?: string; error?: string }> {
  try {
    const res = await api.generateScimToken();
    revalidatePath("/settings/sso");
    return { token: res.token ?? undefined, base_url: res.base_url };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't enable SCIM provisioning." };
  }
}

export async function disableScim(): Promise<{ error?: string }> {
  try {
    await api.disableScim();
    revalidatePath("/settings/sso");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't disable SCIM provisioning." };
  }
}
