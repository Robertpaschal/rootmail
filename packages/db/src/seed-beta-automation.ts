/**
 * Seed rootmail's own beta-invite automation.
 *
 * This is deliberately NOT a code path. It creates a real template and a real
 * sequence inside rootmail-hq — the same two objects a customer creates to send
 * a welcome email — and then gets out of the way. The waitlist tags the contact,
 * the trigger enrolls them, the worker renders and sends.
 *
 * Which means: we cannot ship a broken sequence engine without our own invites
 * breaking first. That is the entire point of running our business on the
 * product, and it is worth more than any test we could write for it.
 *
 * Both objects are editable in the dashboard afterwards. Re-running is safe.
 *
 *   pnpm --filter @rootmail/db exec tsx src/seed-beta-automation.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import { ensureInternalAccount } from "./internal-org";
import { sequences, templates } from "./schema";

const TEMPLATE_SLUG = "beta-invite";
const SEQUENCE_NAME = "Beta invite";
const WAITLIST_TAG = "beta-waitlist";

/**
 * {{beta_invite_code}} is a custom field written onto the contact at signup, so
 * it merges exactly like {{first_name}}. Nothing here knows what a beta is.
 */
const SUBJECT = "You're in — your rootmail beta code";

const HTML = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">
  <p>Hi {{#if first_name}}{{first_name}}{{else}}there{{/if}},</p>
  <p>You asked for access to rootmail, and it's your turn.</p>
  <p style="margin:24px 0;padding:16px;background:#f6f6f6;border-radius:8px;text-align:center">
    <span style="font-size:12px;color:#666;letter-spacing:.08em;text-transform:uppercase">Your invite code</span><br>
    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:.04em">{{beta_invite_code}}</span>
  </p>
  <p>
    <a href="https://app.rootmail.io/signup?invite_code={{beta_invite_code}}"
       style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Create your account</a>
  </p>
  <p style="color:#666;font-size:13px">Every email your business sends — receipts and newsletters — finally in one place. Everything is unlocked while we're in beta: every feature, no plan, no card.</p>
  <p style="color:#666;font-size:13px">In exchange we want to hear what's confusing, broken, or missing. Just reply to this email — it reaches a person.</p>
  <p style="color:#666;font-size:13px;margin-top:20px">— The rootmail team</p>
</div>`;

const TEXT = `Hi {{#if first_name}}{{first_name}}{{else}}there{{/if}},

You asked for access to rootmail, and it's your turn.

Your invite code: {{beta_invite_code}}

Create your account: https://app.rootmail.io/signup?invite_code={{beta_invite_code}}

Everything is unlocked while we're in beta — every feature, no plan, no card.
In exchange we want to hear what's confusing, broken, or missing. Just reply to
this email; it reaches a person.

— The rootmail team`;

async function main(): Promise<void> {
  const { workspaceId } = await ensureInternalAccount();

  const [existingTpl] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(
        eq(templates.workspaceId, workspaceId),
        isNull(templates.subTenantId),
        eq(templates.slug, TEMPLATE_SLUG),
      ),
    )
    .limit(1);

  if (existingTpl) {
    await db
      .update(templates)
      .set({ subject: SUBJECT, html: HTML, text: TEXT, updatedAt: new Date() })
      .where(eq(templates.id, existingTpl.id));
    console.log("template updated:", TEMPLATE_SLUG);
  } else {
    await db.insert(templates).values({
      id: newId("template"),
      workspaceId,
      subTenantId: null,
      name: "Beta invite",
      slug: TEMPLATE_SLUG,
      // Transactional: it is a one-to-one reply to something they asked for.
      type: "transactional",
      subject: SUBJECT,
      html: HTML,
      text: TEXT,
    });
    console.log("template created:", TEMPLATE_SLUG);
  }

  const [existingSeq] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(
      and(
        eq(sequences.workspaceId, workspaceId),
        isNull(sequences.subTenantId),
        eq(sequences.name, SEQUENCE_NAME),
      ),
    )
    .limit(1);

  // No wait step: the code is the thing they are waiting for, and a delay on a
  // requested credential reads as a broken signup, not as good pacing.
  const steps = [{ type: "send" as const, template: TEMPLATE_SLUG }];
  const trigger = { type: "contact_tagged" as const, tag: WAITLIST_TAG };

  if (existingSeq) {
    await db
      .update(sequences)
      .set({ steps, trigger, status: "active", updatedAt: new Date() })
      .where(eq(sequences.id, existingSeq.id));
    console.log("sequence updated:", SEQUENCE_NAME);
  } else {
    await db.insert(sequences).values({
      id: newId("sequence"),
      workspaceId,
      subTenantId: null,
      name: SEQUENCE_NAME,
      status: "active",
      trigger,
      steps,
      // Someone replying to their invite must not stop it being sent — but an
      // unsubscribe must. Leaving `replied` out is deliberate.
      exitOn: ["unsubscribed"],
    });
    console.log("sequence created:", SEQUENCE_NAME, "→ trigger tag:", WAITLIST_TAG);
  }

  process.exit(0);
}

void main();
