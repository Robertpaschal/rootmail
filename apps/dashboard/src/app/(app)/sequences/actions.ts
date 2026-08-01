"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/app/action-form";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SequenceStepDef, SequenceTriggerDef } from "@/lib/types";

export interface SeqFormState {
  error?: string;
  saved?: boolean;
}

function readSteps(raw: string): SequenceStepDef[] {
  try {
    const p: unknown = JSON.parse(raw);
    return Array.isArray(p) ? (p as SequenceStepDef[]) : [];
  } catch {
    return [];
  }
}

export async function saveSequence(
  _prev: SeqFormState | null,
  formData: FormData,
): Promise<SeqFormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A name is required." };
  const triggerType = String(formData.get("trigger_type") ?? "manual") as SequenceTriggerDef["type"];
  const tag = String(formData.get("trigger_tag") ?? "").trim();
  const trigger: SequenceTriggerDef = {
    type: triggerType,
    ...(triggerType === "contact_tagged" && tag ? { tag } : {}),
  };
  const status = String(formData.get("status") ?? "active") === "paused" ? "paused" : "active";
  const steps = readSteps(String(formData.get("steps") ?? "[]"));

  let createdId: string | null = null;
  try {
    if (id) {
      await api.updateSequence(id, { name, trigger, status, steps });
    } else {
      const s = await api.createSequence({ name, trigger, status, steps });
      createdId = s.id;
    }
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to save the sequence." };
  }

  revalidatePath("/sequences");
  if (createdId) redirect(`/sequences/${createdId}`);
  revalidatePath(`/sequences/${id}`);
  return { saved: true };
}

export async function deleteSequenceAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  try {
    await api.deleteSequence(id);
  } catch (err) {
    return {
      error:
        err instanceof ConnectionError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
    };
  }
  revalidatePath("/sequences");
  redirect("/sequences");
  return {};
}

export async function enrollAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!id || !email) return { error: "Missing details for this action." };
  try {
    await api.enrollContact(id, email);
  } catch (err) {
    return {
      error:
        err instanceof ConnectionError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
    };
  }
  revalidatePath(`/sequences/${id}`);
  return {};
}
