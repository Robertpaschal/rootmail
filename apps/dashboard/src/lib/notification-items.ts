import type { Change } from "./changes";
import type { Campaign, Thread } from "./types";

export type NotificationSection = "attention" | "activity" | "updates";
export interface ProductUpdate {
  id: string;
  title: string;
  date: string;
  published_at: string | null;
  status: string;
  changes: { kind: string; text: string }[];
}
export interface NotificationItem {
  id: string;
  section: NotificationSection;
  kind: "reply" | "sending" | "campaign" | "release";
  title: string;
  detail: string;
  at: string | null;
  href: string;
  action: string;
  source?: string;
}

/** Only dated, recent actions we performed earn space on Overview. A score,
 * projection, data gap or manually resumed sender is not something we did. */
export function recentWorkspaceActions(changes: Change[], now = Date.now()): Change[] {
  return changes.filter((c) => {
    const at = c.at ? Date.parse(c.at) : NaN;
    return c.actor === "rootmail" && !c.gap &&
      c.id.startsWith("rep-") &&
      Number.isFinite(at) && at <= now && now - at < 86_400_000;
  }).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 2);
}

export function notificationItems({ threads, changes, campaigns, updates }: {
  threads: Thread[]; changes: Change[]; campaigns: Campaign[]; updates: ProductUpdate[];
}): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const t of threads.filter((t) => t.status === "needs_reply")) {
    items.push({ id: `reply:${t.id}:${t.last_message_at}`, section: "attention", kind: "reply",
      title: `${t.contact_name || t.contact_email} is waiting for a reply`,
      detail: t.subject || "Conversation without a subject", at: t.last_message_at,
      href: `/inbox/${t.id}`, action: "Open conversation" });
  }
  for (const c of changes.filter((c) => !c.gap && c.tone !== "unknown")) {
    items.push({ id: `activity:${c.id}:${c.at ?? c.headline}`, kind: "sending",
      section: (c.id.startsWith("drift-") || c.id.startsWith("dkim-") || !c.at) && (c.tone === "acted" || c.tone === "stopped") ? "attention" : "activity",
      title: c.headline, detail: c.detail, at: c.at,
      href: c.action?.href ?? "/activity", action: c.action?.label ?? "View activity log",
      source: c.metric ? `${c.metric.value} · ${c.metric.label} · ${c.metric.window} · ${c.metric.method}` : undefined });
  }
  for (const c of campaigns.filter((c) => c.status === "sending" || c.status === "scheduled")) {
    items.push({ id: `campaign:${c.id}:${c.status}`, section: "activity", kind: "campaign",
      title: c.status === "sending" ? `${c.name} is sending` : `${c.name} is scheduled`,
      detail: c.status === "sending" ? "Open the campaign to see its recorded progress." : "Open the campaign to review its scheduled send time.",
      at: null, href: `/campaigns/${c.id}`, action: "View campaign" });
  }
  for (const u of updates.filter((u) => u.status === "published")) {
    const summary = u.changes.map((c) => c.text).join(" ");
    items.push({ id: `release:${u.id}:${u.published_at ?? u.date}`, section: "updates", kind: "release",
      title: u.title, detail: summary.length > 220 ? `${summary.slice(0, 220).replace(/\s+\S*$/, "")}…` : summary, at: u.published_at ?? u.date,
      href: `/product-updates#${u.id}`, action: "Read product update" });
  }
  return items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/** Seen means viewed on this browser, never replied to or resolved. */
export function unseenUpdates(items: NotificationItem[], seen: string[], now = Date.now()): NotificationItem[] {
  return items.filter((item) => {
    const at = item.at ? Date.parse(item.at) : NaN;
    return item.section !== "attention" && Number.isFinite(at) && at <= now &&
      now - at < 30 * 86_400_000 && !seen.includes(item.id);
  });
}
