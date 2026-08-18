"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/app/action-form";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";

export interface CreateState {
  error?: string;
}

export async function createSubTenant(
  _prev: CreateState | null,
  formData: FormData,
): Promise<CreateState> {
  const name = String(formData.get("name") ?? "").trim();
  const sending_domain = String(formData.get("sending_domain") ?? "")
    .trim()
    .toLowerCase();
  const external_id = String(formData.get("external_id") ?? "").trim();

  if (!name) return { error: "A name is required." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(sending_domain)) {
    return { error: "Enter a valid domain like sunsetvillas.com." };
  }

  let id: string;
  try {
    const st = await api.createSubTenant({
      name,
      sending_domain,
      external_id: external_id || undefined,
    });
    id = st.id;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to create the sub-tenant." };
  }

  revalidatePath("/sub-tenants");
  redirect(`/sub-tenants/${id}`);
}

export async function verifySubTenant(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  try {
    await api.verifySubTenant(id);
  } catch {
    // ignore; the page reflects whatever the current state is
  }
  revalidatePath(`/sub-tenants/${id}`);
  revalidatePath("/sub-tenants");
  return {};
}

// ---------------------------------------------------------------------------
// The staged /sub-tenants/new journey.
//
// `createSubTenant` above REDIRECTS on success, which is right for a one-shot
// form but fatal for a flow: the stage that shows you the DNS records has to be
// reached without a navigation, or the journey is over before it starts. These
// two return data instead and let the client advance the rail.
// ---------------------------------------------------------------------------

export interface StagedCreateState {
  error?: string;
  subTenant?: SubTenant;
}

export async function createSubTenantStaged(input: {
  name: string;
  sending_domain: string;
  external_id?: string;
}): Promise<StagedCreateState> {
  const name = input.name.trim();
  const sending_domain = input.sending_domain.trim().toLowerCase();
  const external_id = (input.external_id ?? "").trim();

  if (!name) return { error: "Give the client a name so you can tell their domains apart." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(sending_domain)) {
    return { error: "That doesn't look like a domain. Try something like news.acme.com." };
  }

  try {
    const st = await api.createSubTenant({
      name,
      sending_domain,
      external_id: external_id || undefined,
    });
    revalidatePath("/sub-tenants");
    return { subTenant: st };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't create the client domain." };
  }
}

export interface StagedVerifyState {
  error?: string;
  subTenant?: SubTenant;
}

/** Re-check DNS and hand back the fresh record, so the stage can react to it. */
export async function verifySubTenantStaged(id: string): Promise<StagedVerifyState> {
  if (!id) return { error: "Missing domain." };
  try {
    const st = await api.verifySubTenant(id);
    revalidatePath("/sub-tenants");
    revalidatePath(`/sub-tenants/${id}`);
    return { subTenant: st };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't check the DNS records just now." };
  }
}

/** Rename a client domain. The sending domain itself is immutable by design —
 *  DKIM and every verified DNS record are bound to it. */
export async function renameSubTenant(id: string, name: string): Promise<{ error?: string }> {
  if (!name.trim()) return { error: "Give the client a name." };
  try {
    await api.updateSubTenant(id, { name: name.trim() });
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't rename this client domain." };
  }
  revalidatePath("/sub-tenants");
  revalidatePath(`/sub-tenants/${id}`);
  return {};
}

/** Remove a client domain. Redirects to the list — the record it was showing is gone. */
export async function removeSubTenant(id: string): Promise<{ error?: string }> {
  try {
    await api.deleteSubTenant(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't remove this client domain." };
  }
  revalidatePath("/sub-tenants");
  redirect("/sub-tenants");
}

/**
 * Lift a reputation pause.
 *
 * The ladder out of the trap door. Deliberately NOT a dismiss: pausing is sticky
 * by design — a paused client that simply stops sending would otherwise "recover"
 * on a decaying trailing average without anyone fixing the list that caused it —
 * so only a human here can clear it, and the API re-baselines the client's window
 * from this moment so the same old bounces can't re-pause them in fifteen minutes.
 *
 * Note which paths get revalidated: the LIST, never the detail page this is
 * called from. Revalidating the current page resets the client state on it — the
 * caller re-renders with `router.refresh()` instead, which keeps it.
 */
export async function resumeSubTenant(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Missing client." };
  try {
    await api.resumeSubTenant(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't resume this client." };
  }
  revalidatePath("/sub-tenants");
  return {};
}
