import { and, eq, sql, type SQL } from "drizzle-orm";
import { auditEntries, db, messages } from "@rootmail/db";

// Shared message-funnel rollup — the same recipe as /v1/analytics, reusable for a
// single campaign or sequence: status breakdown, the sent → delivered → opened →
// clicked funnel (opens/clicks live in the audit log; message status stays
// "delivered"), and the derived rates.

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export interface MessageFunnel {
  total: number;
  by_status: Record<string, number>;
  funnel: { sent: number; delivered: number; opened: number; clicked: number };
  rates: {
    delivery: number;
    open: number;
    click: number;
    click_to_open: number;
    bounce: number;
  };
}

export async function messageFunnel(conds: SQL[]): Promise<MessageFunnel> {
  const statusRows = await db
    .select({ status: messages.status, n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(...conds))
    .groupBy(messages.status);
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) {
    byStatus[r.status] = r.n;
    total += r.n;
  }
  const delivered = byStatus.delivered ?? 0;
  const bounced = byStatus.bounced ?? 0;
  const complained = byStatus.complained ?? 0;
  // "Sent" = messages that actually left for the provider (excludes queued /
  // sending / failed / suppressed, which never reached a recipient).
  const sent = delivered + bounced + complained + (byStatus.sent ?? 0);

  const engagement = async (event: "opened" | "clicked") => {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${auditEntries.messageId})::int` })
      .from(auditEntries)
      .innerJoin(messages, eq(auditEntries.messageId, messages.id))
      .where(and(eq(auditEntries.event, event), ...conds));
    return row?.n ?? 0;
  };
  const opened = await engagement("opened");
  const clicked = await engagement("clicked");

  return {
    total,
    by_status: byStatus,
    funnel: { sent, delivered, opened, clicked },
    rates: {
      delivery: pct(delivered, sent),
      open: pct(opened, delivered),
      click: pct(clicked, delivered),
      click_to_open: pct(clicked, opened),
      bounce: pct(bounced, sent),
    },
  };
}
