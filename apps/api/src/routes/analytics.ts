import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, auditEntries, messages, templates } from "@rootmail/db";
import { parse } from "../lib/validate";

const query = z.object({
  window_days: z.coerce.number().int().min(1).max(90).default(30),
  sub_tenant_id: z.string().optional(),
});

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // Customer-facing engagement analytics: the sent → delivered → opened → clicked
  // funnel, a daily send series, and top templates — workspace-scoped, read-only.
  app.get("/v1/analytics", async (req) => {
    const q = parse(query, req.query);
    const wsId = req.auth.workspace.id;
    const since = new Date(Date.now() - q.window_days * 86_400_000);
    const base = [eq(messages.workspaceId, wsId), gte(messages.createdAt, since)];
    if (q.sub_tenant_id) base.push(eq(messages.subTenantId, q.sub_tenant_id));

    // Status breakdown.
    const statusRows = await db
      .select({ status: messages.status, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...base))
      .groupBy(messages.status);
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = r.n;
    const delivered = byStatus.delivered ?? 0;
    const bounced = byStatus.bounced ?? 0;
    const complained = byStatus.complained ?? 0;
    // "Sent" = messages that actually left for the provider (excludes queued /
    // sending / failed / suppressed, which never reached a recipient).
    const sent = delivered + bounced + complained + (byStatus.sent ?? 0);

    // Opens & clicks come from the audit log (status stays "delivered"), counted
    // as distinct messages that reached each stage.
    const engagement = async (event: "opened" | "clicked") => {
      const [row] = await db
        .select({ n: sql<number>`count(distinct ${auditEntries.messageId})::int` })
        .from(auditEntries)
        .innerJoin(messages, eq(auditEntries.messageId, messages.id))
        .where(and(eq(auditEntries.event, event), ...base));
      return row?.n ?? 0;
    };
    const opened = await engagement("opened");
    const clicked = await engagement("clicked");

    // Daily send series, gap-filled so the chart is evenly spaced.
    const dayRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(and(...base))
      .groupBy(sql`date_trunc('day', ${messages.createdAt})`);
    const counts = new Map(dayRows.map((r) => [r.day, r.n]));
    const series: { date: string; sent: number }[] = [];
    for (let i = q.window_days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      series.push({ date: d, sent: counts.get(d) ?? 0 });
    }

    // Top templates by volume in the window.
    const topRows = await db
      .select({
        template_id: messages.templateId,
        sent: sql<number>`count(*)::int`,
        delivered: sql<number>`count(*) filter (where ${messages.status} = 'delivered')::int`,
      })
      .from(messages)
      .where(and(...base, sql`${messages.templateId} is not null`))
      .groupBy(messages.templateId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);
    const ids = topRows.map((r) => r.template_id).filter((x): x is string => !!x);
    const names = ids.length
      ? await db.select({ id: templates.id, name: templates.name, slug: templates.slug }).from(templates).where(inArray(templates.id, ids))
      : [];
    const nameOf = new Map(names.map((t) => [t.id, t.name || t.slug]));
    const top_templates = topRows.map((r) => ({
      template_id: r.template_id,
      name: r.template_id ? (nameOf.get(r.template_id) ?? "(unknown)") : "(none)",
      sent: r.sent,
      delivered: r.delivered,
      delivered_rate: pct(r.delivered, r.sent),
    }));

    return {
      object: "analytics",
      window_days: q.window_days,
      scope: { sub_tenant_id: q.sub_tenant_id ?? null },
      funnel: { sent, delivered, opened, clicked },
      rates: {
        delivery: pct(delivered, sent),
        open: pct(opened, delivered),
        click: pct(clicked, delivered),
        click_to_open: pct(clicked, opened),
        // Bounces + spam complaints as a share of everything that left — the
        // "watch this" number for sender health.
        bounce: pct(bounced + complained, sent),
      },
      series,
      top_templates,
    };
  });
}
