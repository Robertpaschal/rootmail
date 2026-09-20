"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Bell, Check, Mail, Megaphone, RefreshCw, ScrollText, Sparkles, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { unseenUpdates, type NotificationSection } from "@/lib/notification-items";
import type { NotificationsSnapshot } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { refreshNotifications } from "./notification-actions";
import { SegmentedControl } from "./segmented-control";

const SECTIONS: { id: NotificationSection; label: string; empty: string }[] = [
  { id: "attention", label: "Needs attention", empty: "No recent replies or sending issues need your attention." },
  { id: "activity", label: "Activity", empty: "No recent sending activity to show." },
  { id: "updates", label: "Product updates", empty: "No published updates to show yet." },
];
const ICONS = { reply: Mail, sending: ScrollText, campaign: Megaphone, release: Sparkles };
const CATEGORY_OPTIONS = SECTIONS.map((s) => ({ value: s.id, label: s.label }));

export function NotificationCenter({ initial }: { initial: NotificationsSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<NotificationSection>("attention");
  const [direction, setDirection] = useState(1);
  const [data, setData] = useState(initial);
  const [seen, setSeen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const storageKey = data ? `rm-notification-seen:${data.scope}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const read = () => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        setSeen(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(-200) : []);
      } catch { setSeen([]); }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [storageKey]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await refreshNotifications();
      // A workspace/account change may finish while the request is in flight.
      // Never put the previous identity's response into this panel.
      if (initial && next.scope !== initial.scope) return;
      setData(next);
      setFailed(false);
    } catch { setFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  }, [initial]);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); };
  }, [refresh]);

  const items = data?.items ?? [];
  const unseen = unseenUpdates(items, seen);
  const needsAttention = items.some((item) => item.section === "attention");
  const hasIndicator = needsAttention || unseen.length > 0;
  const active = SECTIONS.find((s) => s.id === section)!;
  const visible = items.filter((item) => item.section === section);

  function markUpdatesSeen() {
    if (!storageKey) return;
    const ids = [...new Set([...seen, ...items.filter((i) => i.section !== "attention").map((i) => i.id)])].slice(-200);
    setSeen(ids);
    try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* Still works for this visit. */ }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) {
        setSection(needsAttention ? "attention" : unseen.some((i) => i.section === "updates") ? "updates" : "activity");
        void refresh();
      }
    }}>
      <Dialog.Trigger asChild>
        <button type="button" className="topbar-control topbar-icon relative" aria-label={hasIndicator ? "Notifications — new items or attention needed" : "Notifications"} title="Notifications">
          <Bell className="size-[18px]" />
          {hasIndicator ? <span aria-hidden="true" className="absolute right-2.5 top-2 size-2 rounded-full bg-brass ring-2 ring-card" /> : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" />
        <Dialog.Content className="ui-menu-enter fixed inset-x-3 top-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-e3 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[29rem]">
          <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold">Notifications</Dialog.Title>
              <Dialog.Description className="mt-1 break-words text-sm text-muted-foreground">
                {data?.workspaceName ?? "Your workspace"} · replies, sending activity and product news.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" className="topbar-control topbar-icon" aria-label="Close notifications"><X className="size-4" /></button></Dialog.Close>
          </div>
          <SegmentedControl label="Notification category" options={CATEGORY_OPTIONS} value={section} onChange={(next) => {
            setDirection(SECTIONS.findIndex((s) => s.id === next) > SECTIONS.findIndex((s) => s.id === section) ? 1 : -1);
            setSection(next);
          }} className="mx-4 mb-4" />
          <div className="min-h-0 overflow-y-auto overscroll-contain border-y px-4 py-4" aria-busy={busy}>
            {failed || data?.unavailable.length ? <p role="status" className="mb-3 rounded-xl border border-acted/40 bg-acted-tint p-3 text-sm text-acted">{failed ? "Could not refresh notifications. Previously loaded items may be out of date." : `${data?.unavailable.join(", ")} could not be refreshed. Other items are still available.`}</p> : null}
            <div key={section} className="ui-scene-enter min-h-32" style={{ "--ui-scene-x": `${direction * 16}px` } as React.CSSProperties}>
            {!data ? <p role="status" className="py-6 text-sm text-muted-foreground">{busy ? "Loading notifications…" : "Notifications could not be loaded. Try refreshing."}</p> : visible.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{data.unavailable.length ? "No items available in this category. Some sources could not be loaded." : active.empty}</p> : (
              <ul className="space-y-3">
                {visible.map((item) => {
                  const Icon = ICONS[item.kind];
                  const isNew = unseen.some((i) => i.id === item.id);
                  return <li key={item.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-4" /><span>{item.kind === "reply" ? "Reply needed" : item.kind === "release" ? "Product update" : item.kind === "campaign" ? "Campaign progress" : "Sending activity"}</span>{isNew ? <span className="ml-auto rounded-full bg-brass-tint px-2 py-0.5 text-brass-text">New</span> : null}</div>
                    <h3 className="mt-2 break-words text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                    {item.source ? <p className="mt-2 break-words font-mono text-xs text-muted-foreground">{item.source}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <Link href={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brass-text hover:underline">{item.action}<ArrowRight className="size-3.5" /></Link>
                      {item.at ? <time dateTime={item.at} className="text-xs text-muted-foreground">{relativeTime(item.at)}</time> : null}
                    </div>
                  </li>;
                })}
              </ul>
            )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/activity" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center gap-1 text-sm text-brass-text">Activity log <ArrowRight className="size-3.5" /></Link>
            <button type="button" onClick={markUpdatesSeen} disabled={!unseen.length} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"><Check className="size-4" />Mark updates seen</button>
            <button type="button" onClick={() => void refresh()} disabled={busy} aria-label="Refresh notifications" className="topbar-control topbar-icon"><RefreshCw className={cn("size-4", busy && "animate-spin")} /></button>
          </div>
          <p className="px-5 pb-4 text-xs text-muted-foreground">Seen status is saved on this browser. Replies stay here until answered or closed.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
