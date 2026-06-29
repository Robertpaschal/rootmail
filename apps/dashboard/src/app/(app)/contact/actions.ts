"use server";

import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export type ContactState = { ok?: boolean; error?: string };

// Topic → lead source tag (so staff can triage in the admin Leads inbox).
const SOURCES: Record<string, string> = {
  sales: "dashboard_sales",
  support: "dashboard_support",
  general: "dashboard_general",
};

export async function submitDashboardLead(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim();
  const message = String(fd.get("message") ?? "").trim();
  const topic = String(fd.get("topic") ?? "support");
  const expectedVolume = String(fd.get("expected_volume") ?? "").trim();

  if (!name) return { error: "Please add your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (!message) return { error: "Tell us how we can help." };

  // Attach authoritative org context server-side (never trust client fields), so
  // staff can act on the exact org — e.g. provision a custom plan for an Enterprise ask.
  let company: string | undefined;
  let context = "";
  try {
    const [me, org] = await Promise.all([api.me(), api.getOrganization()]);
    company = org.name;
    context = `\n\n— from the dashboard · org: ${org.name} (${org.id}) · plan: ${org.plan} · signed in as ${me.user.email}`;
  } catch {
    // best-effort; the lead still goes through without the context line
  }

  try {
    await api.createLead({
      name,
      email,
      company,
      message: message + context,
      source: SOURCES[topic] ?? "dashboard_support",
      expected_volume: expectedVolume || undefined,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      return { error: "Too many requests — wait a minute and try again." };
    }
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't send your message. Please try again." };
  }
  return { ok: true };
}
