/**
 * rootmail's own beta-invite automation: a real template and a real sequence
 * inside rootmail-hq — the same two objects a customer creates to send a
 * welcome email. The waitlist tags the contact, the trigger enrolls them, the
 * worker renders and sends.
 *
 * These used to exist only if someone remembered to run the seed script. A
 * database that never had it run — a fresh host, a restore, a re-created
 * internal org — had no invite sequence, and nothing noticed: evaluateTriggers
 * found no matching sequence, enrolled nobody and returned. The tester was
 * already tagged ready, so the sweep never looked at them again, and a
 * verified stranger simply never heard from us.
 *
 * So the API now ensures both objects exist (at boot, and again on first use
 * by the sweep), and reports — loudly — when the automation cannot send.
 *
 * ENSURE NEVER OVERWRITES. Both objects stay editable in the dashboard, and a
 * staff member pausing the sequence is a decision, not damage. Only the
 * explicit seed script (`overwrite: true`) resets the copy and re-activates.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import { ensureInternalAccount } from "./internal-org";
import { sequenceEnrollments, sequences, templates } from "./schema";

export const BETA_INVITE_TEMPLATE_SLUG = "beta-invite";
export const BETA_INVITE_SEQUENCE_NAME = "Beta invite";
/** The tag the invite sequence fires on — BETA_READY_TAG in the API. */
export const BETA_INVITE_TRIGGER_TAG = "beta-waitlist";

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

export type BetaInviteProblem =
  | "sequence_missing"
  | "sequence_paused"
  | "send_step_missing"
  | "template_missing";

export interface BetaInviteAutomation {
  /** True when a verified tester tagged ready would actually be sent an invite. */
  ok: boolean;
  workspaceId: string;
  sequenceId: string | null;
  templateId: string | null;
  problems: BetaInviteProblem[];
  /** Not blocking, but wrong: e.g. two active sequences would send two invites. */
  warnings: string[];
  /** What ensureBetaInviteAutomation had to create on this call. */
  created: Array<"template" | "sequence">;
}

function firesOnInviteTag(trigger: unknown): boolean {
  const t = trigger as { type?: string; tag?: string } | null;
  return t?.type === "contact_tagged" && t.tag === BETA_INVITE_TRIGGER_TAG;
}

/**
 * Read-only: would a tester tagged ready right now get an invite?
 *
 * Looks the sequence up the way evaluateTriggers will — by its trigger, not
 * its name — so a staff rename does not read as "missing".
 */
export async function betaInviteAutomationStatus(workspaceId?: string): Promise<BetaInviteAutomation> {
  const ws = workspaceId ?? (await ensureInternalAccount()).workspaceId;
  const rows = await db
    .select({ id: sequences.id, name: sequences.name, status: sequences.status, trigger: sequences.trigger, steps: sequences.steps })
    .from(sequences)
    .where(and(eq(sequences.workspaceId, ws), isNull(sequences.subTenantId)));
  const candidates = rows.filter((s) => firesOnInviteTag(s.trigger));
  const active = candidates.filter((s) => s.status === "active");
  const byName = (list: typeof rows) => list.find((s) => s.name === BETA_INVITE_SEQUENCE_NAME);
  const chosen = byName(active) ?? active[0] ?? byName(candidates) ?? candidates[0] ?? null;

  const problems: BetaInviteProblem[] = [];
  const warnings: string[] = [];
  let templateId: string | null = null;

  if (!chosen) problems.push("sequence_missing");
  else if (chosen.status !== "active") problems.push("sequence_paused");
  if (active.length > 1) {
    warnings.push(`${active.length} active sequences fire on "${BETA_INVITE_TRIGGER_TAG}" — every verified tester would be sent ${active.length} invites`);
  }

  const send = (chosen?.steps ?? []).find((s) => (s as { type?: string }).type === "send") as { template?: string } | undefined;
  if (chosen && !send?.template) problems.push("send_step_missing");
  // Resolve the template the way the worker will: by id or slug. Before the
  // sequence exists, check for ours so a half-seeded database reads as such.
  const ref = send?.template ?? BETA_INVITE_TEMPLATE_SLUG;
  const [tpl] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.workspaceId, ws), sql`(${templates.id} = ${ref} or ${templates.slug} = ${ref})`))
    .limit(1);
  if (tpl) templateId = tpl.id;
  else problems.push("template_missing");

  return { ok: problems.length === 0, workspaceId: ws, sequenceId: chosen?.id ?? null, templateId, problems, warnings, created: [] };
}

/**
 * Make sure the invite automation exists. Idempotent and cheap when it does —
 * one read, no writes — so the sweep can call it on every pass that has
 * someone to promote.
 *
 * Default: create what is MISSING and touch nothing that exists. A paused
 * sequence stays paused (status reports it). `overwrite: true` is the old seed
 * script's behaviour: reset the template copy and the sequence's steps,
 * trigger and status.
 */
export async function ensureBetaInviteAutomation(
  opts: { overwrite?: boolean; workspaceId?: string } = {},
): Promise<BetaInviteAutomation> {
  const workspaceId = opts.workspaceId ?? (await ensureInternalAccount()).workspaceId;
  const current = await betaInviteAutomationStatus(workspaceId);
  const missing = current.problems.includes("sequence_missing") || current.problems.includes("template_missing");
  if (!missing && !opts.overwrite) return current;

  const created: Array<"template" | "sequence"> = [];
  await db.transaction(async (tx) => {
    // Serialise against other API processes and the seed script. Neither
    // object can rely on a unique index here — the templates index includes
    // sub_tenant_id, which is NULL (and NULLs never collide), and sequences
    // have none — so two racing boots would otherwise leave two invite
    // sequences and every tester enrolled in both.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rootmail:beta-invite-automation'))`);

    const [tpl] = await tx
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.workspaceId, workspaceId), isNull(templates.subTenantId), eq(templates.slug, BETA_INVITE_TEMPLATE_SLUG)))
      .limit(1);
    if (!tpl) {
      await tx.insert(templates).values({
        id: newId("template"),
        workspaceId,
        subTenantId: null,
        name: "Beta invite",
        slug: BETA_INVITE_TEMPLATE_SLUG,
        // Transactional: it is a one-to-one reply to something they asked for.
        type: "transactional",
        subject: SUBJECT,
        html: HTML,
        text: TEXT,
      });
      created.push("template");
    } else if (opts.overwrite) {
      await tx
        .update(templates)
        .set({ subject: SUBJECT, html: HTML, text: TEXT, updatedAt: new Date() })
        .where(eq(templates.id, tpl.id));
    }

    // No wait step: the code is the thing they are waiting for, and a delay on a
    // requested credential reads as a broken signup, not as good pacing.
    const steps = [{ type: "send" as const, template: BETA_INVITE_TEMPLATE_SLUG }];
    const trigger = { type: "contact_tagged" as const, tag: BETA_INVITE_TRIGGER_TAG };
    const seqs = await tx
      .select({ id: sequences.id, name: sequences.name, trigger: sequences.trigger })
      .from(sequences)
      .where(and(eq(sequences.workspaceId, workspaceId), isNull(sequences.subTenantId)));
    const named = seqs.find((s) => s.name === BETA_INVITE_SEQUENCE_NAME);
    const firing = seqs.find((s) => firesOnInviteTag(s.trigger));

    if (named && opts.overwrite) {
      await tx
        .update(sequences)
        .set({ steps, trigger, status: "active", updatedAt: new Date() })
        .where(eq(sequences.id, named.id));
    } else if (!named && !firing) {
      await tx.insert(sequences).values({
        id: newId("sequence"),
        workspaceId,
        subTenantId: null,
        name: BETA_INVITE_SEQUENCE_NAME,
        status: "active",
        trigger,
        steps,
        // Someone replying to their invite must not stop it being sent — but an
        // unsubscribe must. Leaving `replied` out is deliberate.
        exitOn: ["unsubscribed"],
      });
      created.push("sequence");
    }
  });

  return { ...(await betaInviteAutomationStatus(workspaceId)), created };
}

/** Has this address ever been enrolled in the invite sequence (any status)? */
export async function hasBetaInviteEnrollment(email: string, workspaceId?: string): Promise<boolean> {
  const ws = workspaceId ?? (await ensureInternalAccount()).workspaceId;
  const rows = await db
    .select({ id: sequenceEnrollments.id, trigger: sequences.trigger })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(and(eq(sequenceEnrollments.workspaceId, ws), eq(sequenceEnrollments.email, email.toLowerCase())));
  return rows.some((r) => firesOnInviteTag(r.trigger));
}
