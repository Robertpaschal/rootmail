"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface WorkspaceActionState {
  error?: string;
}

/** Switch the session's active workspace, then refresh every server component. */
export async function switchWorkspace(id: string): Promise<WorkspaceActionState> {
  if (!id) return { error: "Missing workspace." };
  try {
    await api.setActiveWorkspace(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't switch workspace." };
  }
  // The active workspace scopes nearly every server-rendered view → revalidate
  // the whole app layout so the switch is reflected immediately.
  revalidatePath("/", "layout");
  return {};
}

/** Create a new live workspace and make it active. */
export async function createWorkspace(name: string): Promise<WorkspaceActionState> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "A name is required." };
  try {
    const ws = await api.createWorkspace(trimmed);
    // New workspace becomes the active one so the user lands in it.
    await api.setActiveWorkspace(ws.id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't create workspace." };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Rename a workspace (display name only). */
export async function renameWorkspace(id: string, name: string): Promise<WorkspaceActionState> {
  const trimmed = name.trim();
  if (!id || !trimmed) return { error: "A name is required." };
  try {
    await api.renameWorkspace(id, trimmed);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't rename workspace." };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Delete a workspace and all its data (cascades). Guarded server-side (can't delete
 * the sandbox or your only live workspace). */
export async function deleteWorkspace(id: string): Promise<WorkspaceActionState> {
  if (!id) return { error: "Missing workspace." };
  try {
    await api.deleteWorkspace(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't delete workspace." };
  }
  revalidatePath("/", "layout");
  return {};
}
