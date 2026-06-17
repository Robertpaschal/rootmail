"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { CreatedWebhookEndpoint, WebhookDelivery } from "@/lib/types";

export interface CreateState {
  created?: CreatedWebhookEndpoint;
  error?: string;
}

export async function createWebhook(_prev: CreateState | null, formData: FormData): Promise<CreateState> {
  const url = String(formData.get("url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const events = formData.getAll("events").map(String).filter(Boolean);
  if (!url) return { error: "Enter an endpoint URL." };
  try {
    const created = await api.createWebhook({
      url,
      description,
      events: events.length ? events : undefined,
    });
    revalidatePath("/webhooks");
    return { created };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't create the endpoint." };
  }
}

export async function setWebhookStatus(id: string, status: "active" | "disabled"): Promise<{ error?: string }> {
  try {
    await api.updateWebhook(id, { status });
    revalidatePath("/webhooks");
    return {};
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Update failed." };
  }
}

export async function deleteWebhook(id: string): Promise<{ error?: string }> {
  try {
    await api.deleteWebhook(id);
    revalidatePath("/webhooks");
    return {};
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Delete failed." };
  }
}

export async function loadDeliveries(id: string): Promise<{ deliveries?: WebhookDelivery[]; error?: string }> {
  try {
    return { deliveries: (await api.webhookDeliveries(id)).data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Couldn't load deliveries." };
  }
}
