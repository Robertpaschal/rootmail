"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SendingAccess } from "@/lib/types";

type InboxResult = { access: SendingAccess; message?: string } | { error: string };

export async function refreshTestInboxes(): Promise<InboxResult> {
  try { return { access: await api.sendingAccess() }; }
  catch (err) { return { error: err instanceof Error ? err.message : "Could not check your test inboxes." }; }
}

export async function addTestInbox(email: string): Promise<InboxResult> {
  try {
    await api.addTestInbox(email.trim());
    return { access: await api.sendingAccess(), message: "Inbox added. If confirmation is pending, open the Amazon Web Services email and follow its link, then check status here." };
  } catch (err) { return { error: err instanceof Error ? err.message : "Could not add this inbox." }; }
}

export async function removeTestInbox(id: string): Promise<InboxResult> {
  try {
    await api.removeTestInbox(id);
    return { access: await api.sendingAccess(), message: "Removed from this workspace's test inboxes. Your contacts and message history are kept." };
  } catch (err) { return { error: err instanceof Error ? err.message : "Could not remove this inbox." }; }
}

export async function prepareBetaAudience(): Promise<{ list_id: string } | { error: string }> {
  try {
    const result = await api.prepareBetaAudience();
    revalidatePath("/contacts");
    revalidatePath("/campaigns/new");
    return { list_id: result.list_id };
  } catch (err) { return { error: err instanceof Error ? err.message : "Could not prepare your beta audience." }; }
}

/** A believable sample email, so what you see under test is what you'd ship. */
function sampleHtml(scenario: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;padding:8px 4px;">
  <p>Hi there,</p>
  <p>This is a rootmail test email. Open its message record in Rootmail to see the events reported by your sending provider.</p>
  <p><strong>Scenario:</strong> ${scenario}</p>
  <p>Simulator outcomes test event handling. They do not prove inbox placement, authentication or how a real recipient will engage.</p>
  <p>— The rootmail team</p>
</div>`;
}

/**
 * Run one test scenario: a real send to a destination that can't be harmed.
 * Returns an error string, or null when the send was accepted.
 */
export async function runTestSend(input: { to: string; label: string }): Promise<string | null> {
  try {
    await api.send({
      to: input.to,
      type: "transactional", // a one-to-one test IS transactional, by definition
      subject: `rootmail test · ${input.label}`,
      html: sampleHtml(input.label),
      tags: ["test"],
    });
    revalidatePath("/testing");
    revalidatePath("/messages");
    return null;
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return err.message;
    return "Couldn't send the test. Please try again.";
  }
}

/**
 * Clear suppressions for the test domain so bounce/complaint scenarios can be
 * run again. Real recipients are never touched.
 */
export async function resetTestRecipients(): Promise<{ cleared: number } | { error: string }> {
  try {
    const res = await api.resetTestRecipients();
    revalidatePath("/testing");
    return { cleared: res.cleared };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't reset the test addresses." };
  }
}
