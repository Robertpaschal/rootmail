"use server";

import { revalidatePath } from "next/cache";
import { ApiError, api } from "@/lib/rootmail";

export interface ProfileState {
  ok?: boolean;
  error?: string;
  name?: string | null;
}

// A profile change shows up in two places: the settings page and the app shell
// (the top bar renders the name + avatar), so refresh both.
function refreshProfileSurfaces() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function saveProfileName(
  _prev: ProfileState | null,
  formData: FormData,
): Promise<ProfileState> {
  const name = String(formData.get("name") ?? "").trim();
  try {
    await api.updateProfile({ name: name || null });
    refreshProfileSurfaces();
    return { ok: true, name: name || null };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Couldn't save your name." };
  }
}

export async function uploadProfileAvatar(formData: FormData): Promise<ProfileState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  try {
    await api.uploadAvatar(file);
    refreshProfileSurfaces();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Couldn't upload your picture." };
  }
}

export async function removeProfileAvatar(): Promise<ProfileState> {
  try {
    await api.updateProfile({ remove_avatar: true });
    refreshProfileSurfaces();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Couldn't remove your picture." };
  }
}
