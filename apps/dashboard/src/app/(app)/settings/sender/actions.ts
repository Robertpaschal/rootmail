"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Organization, ReplyDomainCheck, SenderIdentity } from "@/lib/types";

export type SenderState = { ok?: boolean; error?: string };

export async function activateBetaSenderAction(): Promise<SenderState & { sender?: SenderIdentity }> {
  try {
    const sender = await api.activateBetaSender();
    revalidatePath("/testing");
    revalidatePath("/messages/new");
    revalidatePath("/settings/sender");
    return { ok: true, sender };
  } catch (err) {
    return { error: err instanceof ApiError || err instanceof ConnectionError ? err.message : "Couldn't activate the beta address. Please try again." };
  }
}

/** Set (or clear) the branded reply subdomain. Returns the updated org. billing.manage. */
export async function setReplyDomainAction(domain: string | null): Promise<{ org?: Organization; error?: string }> {
  try {
    const org = await api.setReplyDomain(domain);
    revalidatePath("/settings/sender");
    return { org };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save the reply domain." };
  }
}

/** Re-check the reply domain's DNS. Returns whether it's live + per-record detail. */
export async function verifyReplyDomainAction(): Promise<{
  ok?: boolean;
  checks?: ReplyDomainCheck[];
  org?: Organization;
  error?: string;
}> {
  try {
    const res = await api.verifyReplyDomain();
    revalidatePath("/settings/sender");
    return { ok: res.ok, checks: res.checks, org: res.organization };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't check the DNS records." };
  }
}

/** Set how replies come back: captured into the Replies inbox, or straight to the
 * sender's own mailbox. billing.manage. */
export async function updateReplyMode(mode: "inbox" | "own_mailbox"): Promise<SenderState> {
  try {
    await api.updateOrganization({ reply_mode: mode });
    revalidatePath("/settings/sender");
    revalidatePath("/inbox");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Only owners and billing managers can change how replies are handled." };
    }
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't update reply handling. Please try again." };
  }
}

/** Save the org's CAN-SPAM postal address (blank clears it). billing.manage. */
export async function updateSenderAddress(
  _prev: SenderState,
  formData: FormData,
): Promise<SenderState> {
  const raw = String(formData.get("postal_address") ?? "").trim();
  if (raw.length > 500) return { error: "Keep the address under 500 characters." };
  try {
    await api.updateOrganization({ postal_address: raw || null });
    revalidatePath("/settings/sender");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Only owners and billing managers can change the sender address." };
    }
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save the address. Please try again." };
  }
}

// --- Own from-addresses (SES identity verification) --------------------------

export async function addSenderAction(_prev: SenderState, formData: FormData): Promise<SenderState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  try {
    await api.addSender({ email, display_name: displayName || undefined });
    revalidatePath("/settings/sender");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't add that address." };
  }
}

export async function checkSenderAction(id: string): Promise<{ status?: string; error?: string }> {
  try {
    const res = await api.checkSender(id);
    revalidatePath("/settings/sender");
    return { status: res.status };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't check verification." };
  }
}

export async function setDefaultSenderAction(id: string): Promise<{ error?: string }> {
  try {
    await api.setDefaultSender(id);
    revalidatePath("/settings/sender");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't set the default sender." };
  }
}

export async function deleteSenderAction(id: string): Promise<{ error?: string }> {
  try {
    await api.deleteSender(id);
    revalidatePath("/settings/sender");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't remove that address." };
  }
}

export interface ProviderState {
  error?: string;
  ok?: string;
}

/**
 * Connect the customer's own sending account.
 *
 * The API checks the credentials against the live provider before storing them,
 * so an error here is a real answer from AWS or Mailgun — worth showing verbatim
 * rather than flattening to "couldn't connect".
 */
/** A BYO-only field, sent only when filled in (so unflagged requests are unchanged). */
/** A trimmed form field, sent under `as` (default: its own name) only when filled in. */
function optional(formData: FormData, name: string, as: string = name): Record<string, string> {
  const v = String(formData.get(name) ?? "").trim();
  return v ? { [as]: v } : {};
}

export async function connectSendingProvider(
  _prev: ProviderState | null,
  formData: FormData,
): Promise<ProviderState> {
  const provider = String(formData.get("provider") ?? "");
  const body: Record<string, unknown> =
    provider === "ses"
      ? {
          provider: "ses",
          access_key_id: String(formData.get("access_key_id") ?? "").trim(),
          secret_access_key: String(formData.get("secret_access_key") ?? "").trim(),
          region: String(formData.get("region") ?? "us-east-1").trim(),
          ...optional(formData, "sns_topic_arn"),
          ...optional(formData, "configuration_set"),
        }
      : provider === "ses_role"
        ? {
            provider: "ses_role",
            role_arn: String(formData.get("role_arn") ?? "").trim(),
            region: String(formData.get("role_region") ?? "us-east-1").trim(),
            ...optional(formData, "role_sns_topic_arn", "sns_topic_arn"),
            ...optional(formData, "role_configuration_set", "configuration_set"),
          }
      : provider === "smtp"
        ? {
            provider: "smtp",
            host: String(formData.get("smtp_host") ?? "").trim(),
            port: Number(formData.get("smtp_port") ?? 587),
            username: String(formData.get("smtp_username") ?? "").trim(),
            // Not trimmed: a password may legitimately start or end with a space.
            password: String(formData.get("smtp_password") ?? ""),
            sending_domains: String(formData.get("smtp_sending_domains") ?? "")
              .split(/[\s,]+/)
              .map((d) => d.trim())
              .filter(Boolean),
          }
      : {
          provider: "mailgun",
          api_key: String(formData.get("api_key") ?? "").trim(),
          domain: String(formData.get("domain") ?? "").trim(),
          region: String(formData.get("mg_region") ?? "us"),
          ...optional(formData, "webhook_signing_key"),
        };

  try {
    const res = await api.connectSendingProvider(body);
    revalidatePath("/settings/sender");
    return { ok: res.note ?? "Connected." };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't connect that account." };
  }
}

export async function disconnectSendingProvider(): Promise<ProviderState> {
  try {
    const res = await api.disconnectSendingProvider();
    revalidatePath("/settings/sender");
    return { ok: res.note };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't disconnect." };
  }
}
