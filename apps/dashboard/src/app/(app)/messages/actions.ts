"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api, type SendBody, type SimulatableEvent } from "@/lib/rootmail";

export interface SendState {
  error?: string;
}

export async function sendMessage(
  _prev: SendState | null,
  formData: FormData,
): Promise<SendState> {
  const to = String(formData.get("to") ?? "").trim();
  const type = String(formData.get("type") ?? "transactional");
  const priority = String(formData.get("priority") ?? "normal");
  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "").trim();
  const template = String(formData.get("template") ?? "").trim();
  const subTenantId = String(formData.get("sub_tenant_id") ?? "").trim();
  const fromEmail = String(formData.get("from_email") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim();
  const variablesRaw = String(formData.get("variables") ?? "").trim();

  if (!to) return { error: "A recipient email is required." };
  if (!template && (!subject || !html)) {
    return { error: "Provide a template slug, or both a subject and an HTML body." };
  }

  let variables: Record<string, unknown> | undefined;
  if (variablesRaw) {
    try {
      const parsed: unknown = JSON.parse(variablesRaw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: 'Variables must be a JSON object, e.g. {"name":"Ada"}.' };
      }
      variables = parsed as Record<string, unknown>;
    } catch {
      return { error: "Variables must be valid JSON." };
    }
  }

  const body: SendBody = {
    to,
    type: type as SendBody["type"],
    priority: priority as SendBody["priority"],
  };
  if (template) body.template = template;
  if (subject) body.subject = subject;
  if (html) body.html = html;
  if (subTenantId) body.sub_tenant_id = subTenantId;
  if (fromEmail) body.from = fromEmail;
  if (idempotencyKey) body.idempotency_key = idempotencyKey;
  if (variables) body.variables = variables;

  let id: string;
  try {
    const msg = await api.send(body);
    id = msg.id;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to send the message." };
  }

  revalidatePath("/messages");
  revalidatePath("/");
  redirect(`/messages/${id}`);
}

/** Fetch a signed Layer-3 proof bundle (Enterprise) for download. */
export async function getProofAction(
  id: string,
): Promise<{ proof?: string; error?: string; locked?: boolean }> {
  try {
    const p = await api.getProof(id);
    return { proof: JSON.stringify(p, null, 2) };
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") {
      return { error: "Proof bundles are an Enterprise feature.", locked: true };
    }
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to generate the proof bundle." };
  }
}

export async function recordEvent(formData: FormData): Promise<void> {
  const id = String(formData.get("messageId") ?? "");
  const event = String(formData.get("event") ?? "") as SimulatableEvent;
  if (!id || !event) return;

  try {
    await api.recordEvent(id, { event });
  } catch {
    // The simulate buttons are best-effort; on failure the page simply doesn't change.
  }
  revalidatePath(`/messages/${id}`);
  revalidatePath("/messages");
}
