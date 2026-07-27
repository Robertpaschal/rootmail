"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

/** A believable sample email, so what you see under test is what you'd ship. */
function sampleHtml(scenario: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;padding:8px 4px;">
  <p>Hi there,</p>
  <p>This is a rootmail test email. It travelled the same path your real mail takes: signed with your DKIM key, handed to your sending provider, and tracked all the way to its outcome.</p>
  <p><strong>Scenario:</strong> ${scenario}</p>
  <p>If you can read this, rendering, signing and delivery all work.</p>
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
