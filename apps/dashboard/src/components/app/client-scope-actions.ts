"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { ActionState } from "@/components/app/action-form";
import { CLIENT_SCOPE_COOKIE } from "@/lib/client-scope";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

// The selection is workspace-bound (switching workspace clears it), so a long
// cookie life just means "still acting as this client tomorrow morning".
const NINETY_DAYS = 60 * 60 * 24 * 90;

/** Start acting as a client: validate it belongs to the ACTIVE workspace, then
 * remember it and refresh every server-rendered view. */
export async function actAsClient(id: string): Promise<ActionState> {
  if (!id) return { error: "Missing client." };
  try {
    // The registry lookup is never client-scoped, so this validates cleanly.
    await api.getSubTenant(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't switch to that client." };
  }
  const store = await cookies();
  store.set(CLIENT_SCOPE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: NINETY_DAYS,
  });
  revalidatePath("/", "layout");
  return {};
}

/** Back to the whole workspace. */
export async function exitClientScope(): Promise<ActionState> {
  const store = await cookies();
  store.delete(CLIENT_SCOPE_COOKIE);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Form-action flavors, for the plain server-rendered forms (the banner's exit,
 * the "act as" button on each client-domain row).
 *
 * These take the `(prevState, formData)` shape rather than `(formData)` on
 * purpose: a bare `Promise<void>` form action discards its result, so a refused
 * switch would look exactly like a successful one. Paired with `<ActionForm>`,
 * the error has somewhere to land.
 */
export async function actAsClientForm(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  return actAsClient(String(formData.get("id") ?? ""));
}

export async function exitClientScopeForm(): Promise<ActionState> {
  return exitClientScope();
}
