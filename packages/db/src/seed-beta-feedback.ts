/**
 * Seed the beta feedback loop — and the audience the changelog goes to.
 *
 * Like the invite automation, these are REAL objects in rootmail-hq, created
 * once and editable in the dashboard afterwards. Between them they exercise the
 * parts of the engine the invite flow never touches: wait steps, multi-step
 * enrollment, exit conditions, and a self-maintaining segment.
 *
 * Which is the point. The invite sequence proves a trigger fires and a template
 * renders. It cannot tell us whether a wait step wakes up on time, or whether
 * `exitOn: replied` actually stops a follow-up — and "we emailed a tester twice
 * after they already answered" is exactly the bug a customer would rage about.
 *
 *   pnpm --filter @rootmail/db exec tsx src/seed-beta-feedback.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import { ensureInternalAccount } from "./internal-org";
import { lists, sequences, templates } from "./schema";

const TESTER_TAG = "beta-tester";

function wrap(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">${inner}</div>`;
}

const HI = `{{#if first_name}}{{first_name}}{{else}}there{{/if}}`;

/**
 * Day 3: one question, not a survey.
 *
 * A tester who is asked "how's it going?" says "fine". Asking what got in the
 * way gives them permission to complain, which is the only useful answer.
 */
const DAY3 = {
  slug: "beta-checkin-day3",
  name: "Beta check-in (day 3)",
  subject: "What got in your way?",
  html: wrap(
    `<p>Hi ${HI},</p>` +
      `<p>You've had rootmail for a few days now. I'd rather hear the awkward thing than the polite one:</p>` +
      `<p style="margin:20px 0;padding:14px 16px;background:#f6f6f6;border-radius:8px;font-weight:600">What got in your way?</p>` +
      `<p>Anything counts — a button you couldn't find, a word that made no sense, something that broke, something you expected and we don't have. One line is plenty.</p>` +
      `<p>Just hit reply. It comes straight to us.</p>` +
      `<p style="color:#666;font-size:13px;margin-top:20px">— The rootmail team</p>`,
  ),
  text:
    `Hi ${HI},\n\nYou've had rootmail for a few days now. I'd rather hear the awkward ` +
    `thing than the polite one:\n\nWhat got in your way?\n\nAnything counts — a button you ` +
    `couldn't find, a word that made no sense, something that broke, something you expected ` +
    `and we don't have. One line is plenty.\n\nJust hit reply. It comes straight to us.\n\n— The rootmail team`,
};

/**
 * Day 14: the question you can only ask once they've lived with it.
 *
 * Deliberately different from day 3. Sending "any feedback?" twice teaches
 * people that our email is noise.
 */
const DAY14 = {
  slug: "beta-checkin-day14",
  name: "Beta check-in (day 14)",
  subject: "Would you miss it?",
  html: wrap(
    `<p>Hi ${HI},</p>` +
      `<p>Two weeks in. The question that actually tells us something:</p>` +
      `<p style="margin:20px 0;padding:14px 16px;background:#f6f6f6;border-radius:8px;font-weight:600">If rootmail disappeared tomorrow, would you miss it — and what for?</p>` +
      `<p>If the honest answer is "no, not really", that is the single most useful thing you could tell us, and it won't offend anyone here.</p>` +
      `<p>Reply to this email — a person reads it.</p>` +
      `<p style="color:#666;font-size:13px;margin-top:20px">— The rootmail team</p>`,
  ),
  text:
    `Hi ${HI},\n\nTwo weeks in. The question that actually tells us something:\n\n` +
    `If rootmail disappeared tomorrow, would you miss it — and what for?\n\n` +
    `If the honest answer is "no, not really", that is the single most useful thing you ` +
    `could tell us, and it won't offend anyone here.\n\nReply to this email — a person reads it.\n\n— The rootmail team`,
};

async function upsertTemplate(
  workspaceId: string,
  t: { slug: string; name: string; subject: string; html: string; text: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(
        eq(templates.workspaceId, workspaceId),
        isNull(templates.subTenantId),
        eq(templates.slug, t.slug),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(templates)
      .set({ subject: t.subject, html: t.html, text: t.text, updatedAt: new Date() })
      .where(eq(templates.id, existing.id));
    console.log("template updated:", t.slug);
    return;
  }
  await db.insert(templates).values({
    id: newId("template"),
    workspaceId,
    subTenantId: null,
    name: t.name,
    slug: t.slug,
    // MARKETING, not transactional: a check-in is exactly what an unsubscribe is
    // meant to stop. Calling it transactional is how we would end up nagging
    // someone who already asked us to leave them alone.
    type: "marketing",
    subject: t.subject,
    html: t.html,
    text: t.text,
  });
  console.log("template created:", t.slug);
}

async function main(): Promise<void> {
  const { workspaceId } = await ensureInternalAccount();

  await upsertTemplate(workspaceId, DAY3);
  await upsertTemplate(workspaceId, DAY14);

  // 72h then 264h ⇒ nudges land on day 3 and day 14.
  const steps = [
    { type: "wait" as const, hours: 72 },
    { type: "send" as const, template: DAY3.slug },
    { type: "wait" as const, hours: 264 },
    { type: "send" as const, template: DAY14.slug },
  ];

  const [existingSeq] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(
      and(
        eq(sequences.workspaceId, workspaceId),
        isNull(sequences.subTenantId),
        eq(sequences.name, "Beta feedback"),
      ),
    )
    .limit(1);

  const seqValues = {
    status: "active" as const,
    trigger: { type: "contact_tagged" as const, tag: TESTER_TAG },
    steps,
    // `replied` is the whole design: a tester who answers has given us what we
    // asked for, and must never get the day-14 nudge as if they'd said nothing.
    exitOn: ["replied", "unsubscribed"],
  };

  if (existingSeq) {
    await db
      .update(sequences)
      .set({ ...seqValues, updatedAt: new Date() })
      .where(eq(sequences.id, existingSeq.id));
    console.log("sequence updated: Beta feedback");
  } else {
    await db.insert(sequences).values({
      id: newId("sequence"),
      workspaceId,
      subTenantId: null,
      name: "Beta feedback",
      ...seqValues,
    });
    console.log("sequence created: Beta feedback → trigger tag:", TESTER_TAG);
  }

  // The audience the changelog goes to. A FILTER, not a fixed membership — a
  // tester who signs up tomorrow is in it without anyone remembering to add
  // them, and an org that leaves the beta drops out on its own.
  const [existingList] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.workspaceId, workspaceId),
        isNull(lists.subTenantId),
        eq(lists.name, "Beta testers"),
      ),
    )
    .limit(1);

  const filter = { match: "all" as const, conditions: [{ field: "tag", op: "eq" as const, value: TESTER_TAG }] };

  if (existingList) {
    await db.update(lists).set({ filter, updatedAt: new Date() }).where(eq(lists.id, existingList.id));
    console.log("audience updated: Beta testers");
  } else {
    await db.insert(lists).values({
      id: newId("list"),
      workspaceId,
      subTenantId: null,
      name: "Beta testers",
      description: "Everyone currently in the closed beta. Self-maintaining — send the changelog here.",
      filter,
    });
    console.log("audience created: Beta testers (segment on tag)");
  }

  process.exit(0);
}

void main();
