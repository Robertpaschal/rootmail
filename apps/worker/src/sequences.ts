import { and, asc, desc, eq, lte } from "drizzle-orm";
import { env, type SequenceStep } from "@rootmail/core";
import {
  auditEntries,
  db,
  type Sequence,
  type SequenceEnrollment,
  senderIdentities,
  sequenceEnrollments,
  sequences,
  messages,
  subTenants,
  templates,
  workspaces,
} from "@rootmail/db";
import { automationSend } from "./send";

const MAX_ITERATIONS = 50; // per enrollment per tick — defuses a tight branch loop

interface SendCtx {
  workspaceId: string;
  subTenantId: string | null;
  organizationId: string | null;
  mode: "live" | "test";
  fromEmail: string;
  fromName: string | null;
}

async function resolveTemplate(seq: Sequence, ref: string) {
  const rows = await db.select().from(templates).where(eq(templates.workspaceId, seq.workspaceId));
  const matches = rows.filter((r) => r.id === ref || r.slug === ref);
  return (
    matches.find((r) => r.subTenantId === seq.subTenantId) ??
    matches.find((r) => r.subTenantId === null) ??
    matches[0] ??
    null
  );
}

async function eventOccurred(messageId: string, event: "opened" | "clicked"): Promise<boolean> {
  const [row] = await db
    .select({ id: auditEntries.id })
    .from(auditEntries)
    .where(and(eq(auditEntries.messageId, messageId), eq(auditEntries.event, event)))
    .limit(1);
  return !!row;
}

async function messageSentAt(messageId: string): Promise<Date | null> {
  const [row] = await db.select({ at: messages.createdAt }).from(messages).where(eq(messages.id, messageId)).limit(1);
  return row?.at ?? null;
}

async function buildCtx(enr: SequenceEnrollment): Promise<SendCtx> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, enr.workspaceId)).limit(1);
  let fromEmail = `no-reply@${env.ROOTMAIL_DOMAIN}`;
  let fromName: string | null = ws?.name ?? null;
  if (enr.subTenantId) {
    const [st] = await db.select().from(subTenants).where(eq(subTenants.id, enr.subTenantId)).limit(1);
    if (st) {
      fromEmail = `no-reply@${st.sendingDomain}`;
      fromName = st.name;
    }
  } else if (ws?.organizationId) {
    // Send (and receive replies) as the org's own verified sender when it set one
    // up — a drip should feel like it's from the business, not rootmail.
    const [own] = await db
      .select()
      .from(senderIdentities)
      .where(and(eq(senderIdentities.organizationId, ws.organizationId), eq(senderIdentities.status, "verified")))
      .orderBy(desc(senderIdentities.isDefault), asc(senderIdentities.createdAt))
      .limit(1);
    if (own) {
      fromEmail = own.email;
      fromName = own.displayName ?? ws.name;
    }
  }
  return {
    workspaceId: enr.workspaceId,
    subTenantId: enr.subTenantId,
    organizationId: ws?.organizationId ?? null,
    mode: ws?.environment === "test" ? "test" : "live",
    fromEmail,
    fromName,
    // Reply-To is resolved inside automationSend per the org's reply mode
    // (capture into the Replies inbox by default) — a drip's replies thread back
    // to the contact just like every other send.
  };
}

/** Advance a single enrollment through as many steps as it can in this tick. */
async function advance(enr: SequenceEnrollment, seq: Sequence): Promise<void> {
  const steps = seq.steps as SequenceStep[];
  let step = enr.currentStep;
  let nextRunAt = enr.nextRunAt;
  let status: SequenceEnrollment["status"] = "active";
  let lastMessageId = enr.lastMessageId;
  let ctx: SendCtx | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (step >= steps.length) {
      status = "completed";
      break;
    }
    const s = steps[step];

    if (s.type === "wait") {
      step += 1;
      if (s.hours > 0) {
        nextRunAt = new Date(Date.now() + s.hours * 3_600_000);
        break;
      }
      continue;
    }

    if (s.type === "send") {
      if (!ctx) ctx = await buildCtx(enr);
      const tpl = await resolveTemplate(seq, s.template);
      if (!tpl) {
        status = "failed";
        break;
      }
      const res = await automationSend({
        ...ctx,
        type: "marketing",
        to: enr.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        templateId: tpl.id,
        templateVersion: tpl.currentVersion,
        sequenceId: seq.id,
        sequenceStep: step,
      });
      lastMessageId = res.messageId;
      step += 1;
      continue;
    }

    // branch: jump if the event already hit the last send; else wait out the
    // window, then fall through.
    if (s.type === "branch") {
      if (!lastMessageId) {
        step += 1;
        continue;
      }
      if (await eventOccurred(lastMessageId, s.event)) {
        step = s.goto;
        continue;
      }
      const sentAt = await messageSentAt(lastMessageId);
      const windowEnd = (sentAt?.getTime() ?? Date.now()) + s.within_hours * 3_600_000;
      if (Date.now() < windowEnd) {
        // Still inside the window — re-poll on the next tick so we jump as soon
        // as the open/click lands (rather than only at the window's end).
        nextRunAt = new Date();
        break;
      }
      step += 1;
      continue;
    }

    break;
  }

  await db
    .update(sequenceEnrollments)
    .set({
      currentStep: step,
      nextRunAt,
      status,
      lastMessageId,
      completedAt: status === "completed" || status === "failed" ? new Date() : enr.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(sequenceEnrollments.id, enr.id));
}

/** The repeatable tick: advance every due, active enrollment. */
export async function processSequenceTick(): Promise<void> {
  const due = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.status, "active"), lte(sequenceEnrollments.nextRunAt, new Date())))
    .orderBy(desc(sequenceEnrollments.nextRunAt))
    .limit(100);
  if (due.length === 0) return;

  // Cache sequences across the batch.
  const seqCache = new Map<string, Sequence | null>();
  for (const enr of due) {
    let seq = seqCache.get(enr.sequenceId);
    if (seq === undefined) {
      [seq] = await db.select().from(sequences).where(eq(sequences.id, enr.sequenceId)).limit(1);
      seqCache.set(enr.sequenceId, seq ?? null);
    }
    if (!seq || seq.status !== "active") continue; // paused/deleted → leave for later
    try {
      await advance(enr, seq);
    } catch (err) {
      console.error(`[sequences] enrollment ${enr.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
}
