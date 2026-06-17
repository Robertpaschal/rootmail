"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export async function uploadAssetAction(formData: FormData): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  try {
    await api.uploadAsset(file);
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Upload failed." };
  }
  revalidatePath("/assets");
  return {};
}
