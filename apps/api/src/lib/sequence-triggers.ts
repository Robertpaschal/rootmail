import { and, eq, inArray, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db, sequenceEnrollments, sequences } from "@rootmail/db";

/**
 * Enroll a contact into any active sequence whose trigger matches. Best-effort —
 * a trigger hiccup must never fail the contact write that prompted it.
 */
export async function evaluateTriggers(
  workspaceId: string,
  subTenantId: string | null,
  contact: { id?: string | null; email: string; tags: string[] },
  opts: { created: boolean },
): Promise<void> {
  try {
    const email = contact.email.toLowerCase();
    const active = await db
      .select()
      .from(sequences)
      .where(
        and(
          eq(sequences.workspaceId, workspaceId),
          eq(sequences.status, "active"),
          subTenantId ? eq(sequences.subTenantId, subTenantId) : isNull(sequences.subTenantId),
        ),
      );

    for (const seq of active) {
      const t = seq.trigger;
      const match =
        (t.type === "contact_created" && opts.created) ||
        (t.type === "contact_tagged" && !!t.tag && contact.tags.includes(t.tag));
      if (!match) continue;

      const [existing] = await db
        .select({ id: sequenceEnrollments.id })
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, seq.id),
            eq(sequenceEnrollments.email, email),
            eq(sequenceEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (existing) continue;

      await db.insert(sequenceEnrollments).values({
        id: newId("sequenceEnrollment"),
        sequenceId: seq.id,
        workspaceId,
        subTenantId,
        contactId: contact.id ?? null,
        email,
        status: "active",
        currentStep: 0,
        nextRunAt: new Date(),
      });
    }
  } catch (err) {
    console.warn(`[sequences] trigger evaluation failed: ${String(err)}`);
  }
}

/** Exit a contact's active enrollments whose sequence opts to exit on `reason`. */
export async function exitEnrollments(
  workspaceId: string,
  email: string,
  reason: "replied" | "unsubscribed",
): Promise<void> {
  try {
    const rows = await db
      .select({ id: sequenceEnrollments.id, exitOn: sequences.exitOn })
      .from(sequenceEnrollments)
      .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
      .where(
        and(
          eq(sequenceEnrollments.workspaceId, workspaceId),
          eq(sequenceEnrollments.email, email.toLowerCase()),
          eq(sequenceEnrollments.status, "active"),
        ),
      );
    const ids = rows.filter((r) => (r.exitOn as string[]).includes(reason)).map((r) => r.id);
    if (ids.length) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "exited", completedAt: new Date(), updatedAt: new Date() })
        .where(inArray(sequenceEnrollments.id, ids));
    }
  } catch (err) {
    console.warn(`[sequences] exit-on-${reason} failed: ${String(err)}`);
  }
}
