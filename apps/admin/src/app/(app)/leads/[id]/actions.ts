"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

function refresh(id: string) {
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
}

/** Move a lead to a pipeline stage. Form action. */
export async function setLeadStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(LEAD_STATUSES as string[]).includes(status)) return;
  await adminApi.updateLead(id, { status: status as LeadStatus });
  refresh(id);
}

/** Claim, reassign, or release ownership. Empty owner = unassign. Form action. */
export async function assignLead(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const raw = formData.get("owner_staff_id");
  const owner = raw === null || String(raw).trim() === "" ? null : String(raw);
  if (!id) return;
  await adminApi.updateLead(id, { owner_staff_id: owner });
  refresh(id);
}

export type NoteState = { ok?: boolean; error?: string };

/** Append a note to the lead's activity timeline. useActionState. */
export async function addNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id) return { error: "Missing lead." };
  if (!body) return { error: "Write something first." };
  try {
    await adminApi.addLeadNote(id, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Your staff role can't add notes." };
    }
    return { error: "Couldn't save the note. Please try again." };
  }
  revalidatePath(`/leads/${id}`);
  return { ok: true };
}
