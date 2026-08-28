"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FlaskConical, Megaphone, SearchX, Send, User, Workflow } from "lucide-react";
import { MessageFlow } from "@/components/app/message-flow";
import { Pager } from "@/components/app/data-table";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/format";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * THE REGISTER.
 *
 * This was a sortable data table inside a card, which is the same object the
 * contacts page, the templates page and the webhooks page were — four different
 * jobs wearing one shape. What messages actually are is a **log**: an
 * append-only record of things that happened, in time, each with a delivery
 * story attached. So this is a ledger, and the two things a ledger has that a
 * table does not are both load-bearing here.
 *
 * **Day bands.** Mail arrives in days, and the question an operator brings to
 * this page is nearly always "what happened on the day the complaints started".
 * Each band carries its own tally — how many left, how many stopped — so a bad
 * Tuesday is visible without opening a single row. Sorting by recipient, which
 * this page used to offer, answered no question anybody has; searching does,
 * and that stays.
 *
 * **The line leads the row.** It is the first thing on the line and the widest
 * fixed column, because the delivery story IS the record. Everything else on
 * the row identifies which record it is.
 */

// 25 rows, but counted in whole days: cutting a Tuesday in half across a page
// boundary would break the tally the band header prints.
const PAGE_TARGET = 25;

type Band = { key: string; label: string; rows: Message[] };

const STOPPED = new Set(["bounced", "complained", "failed", "suppressed"]);

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** "Today" / "Yesterday" / "Tue 12 Aug" — a date somebody reads, not an ISO. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const days = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MessagesTable({
  messages,
  campaignNames = {},
  sequenceNames = {},
}: {
  messages: Message[];
  campaignNames?: Record<string, string>;
  sequenceNames?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return messages
      .filter(
        (m) =>
          !needle ||
          m.to.toLowerCase().includes(needle) ||
          (m.subject ?? "").toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [messages, q]);

  // Whole days per page. A day never straddles a page boundary, because the
  // band's own tally would then be a lie about the day rather than a fact.
  const pages = useMemo(() => {
    const out: Band[][] = [];
    let current: Band[] = [];
    let count = 0;
    for (const m of filtered) {
      const key = dayKey(m.created_at);
      const last = current[current.length - 1];
      if (last && last.key === key) {
        last.rows.push(m);
      } else {
        if (count >= PAGE_TARGET && current.length) {
          out.push(current);
          current = [];
          count = 0;
        }
        current.push({ key, label: dayLabel(m.created_at), rows: [m] });
      }
      count += 1;
    }
    if (current.length) out.push(current);
    return out;
  }, [filtered]);

  const pageCount = Math.max(1, pages.length);
  const current = Math.min(page, pageCount);
  const bands = pages[current - 1] ?? [];
  // The pager reports rows, not bands — "1–27 of 100 messages" is what somebody
  // reading a register wants to know about their place in it.
  const start = pages.slice(0, current - 1).reduce((n, p) => n + p.reduce((k, b) => k + b.rows.length, 0), 0);
  const shown = bands.reduce((n, b) => n + b.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search recipient or subject…"
          className="h-9 max-w-xs"
        />
        <span className="ml-auto font-mono text-xs text-muted-foreground" data-fact>
          {filtered.length} record{filtered.length === 1 ? "" : "s"} · newest first
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-t border-rule py-10">
          <SearchX className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No matching records</p>
          <p className="text-sm text-muted-foreground">
            Try a different search — or clear it to see everything fetched.
          </p>
        </div>
      ) : (
        <div>
          {bands.map((band) => {
            const stopped = band.rows.filter((m) => STOPPED.has(m.status)).length;
            return (
              <section key={band.key}>
                {/* The band header is sticky: scrolling a long day should never
                    leave you unsure which day you are reading. `top-16`, not
                    `top-0` — the app's own topbar is `sticky top-0 h-16` in the
                    same scroll container, so a band pinned at 0 parks itself
                    underneath it and is never seen. */}
                <div className="sticky top-16 z-10 flex items-baseline gap-3 border-b border-ink/20 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  <h3 className="text-sm font-medium tracking-heading">{band.label}</h3>
                  <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                    {band.rows.length} left
                    {stopped > 0 ? (
                      <>
                        {" · "}
                        <span className="text-stopped">{stopped} stopped</span>
                      </>
                    ) : null}
                  </span>
                </div>

                <ol>
                  {band.rows.map((m) => (
                    <li key={m.id} className="border-b border-rule">
                      <div className="group grid grid-cols-[13rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[13rem_minmax(0,17rem)_minmax(0,1fr)_9rem_3.5rem]">
                        {/* The delivery story, first — it is the record. A
                            FIXED column, because a register whose second column
                            starts at a different x on every row is not a
                            register; the bounce reason truncates here and is
                            printed in full one click away. */}
                        <span className="min-w-0 overflow-hidden">
                          <MessageFlow message={m} />
                        </span>

                        <span className="flex min-w-0 items-center gap-1.5">
                          <Link
                            href={`/messages/${m.id}`}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {m.to}
                          </Link>
                          {m.to_contact_id ? (
                            <Link
                              href={`/contacts/${m.to_contact_id}`}
                              title="Open contact record"
                              className="shrink-0 text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-primary"
                            >
                              <User className="size-3.5" />
                            </Link>
                          ) : null}
                          {/* A test send is real mail — say so, so nobody mistakes a
                              deliberate bounce for a deliverability problem. */}
                          {m.test_recipient ? (
                            <Link
                              href="/testing"
                              title="A test send — real path, safe destination"
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <FlaskConical className="size-2.5" /> Test
                            </Link>
                          ) : null}
                        </span>

                        <Link
                          href={`/messages/${m.id}`}
                          className="col-span-2 min-w-0 truncate text-sm text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-foreground sm:col-span-1"
                        >
                          {m.subject || "(no subject)"}
                        </Link>

                        <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
                          {m.campaign_id ? (
                            <Link
                              href={`/campaigns/${m.campaign_id}`}
                              className="inline-flex max-w-[10rem] items-center gap-1.5 transition-colors hover:text-foreground"
                            >
                              <Megaphone className="size-3.5 shrink-0" />
                              <span className="truncate">{campaignNames[m.campaign_id] ?? "Campaign"}</span>
                            </Link>
                          ) : m.sequence_id ? (
                            <Link
                              href={`/sequences/${m.sequence_id}`}
                              className="inline-flex max-w-[10rem] items-center gap-1.5 transition-colors hover:text-foreground"
                            >
                              <Workflow className="size-3.5 shrink-0" />
                              <span className="truncate">{sequenceNames[m.sequence_id] ?? "Sequence"}</span>
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 opacity-70">
                              <Send className="size-3.5 shrink-0" /> One-to-one
                            </span>
                          )}
                        </span>

                        {/* Clock time inside a day band, not "3 days ago" — the
                            band already said which day, so the row says when. */}
                        <span
                          className={cn(
                            "shrink-0 whitespace-nowrap text-right font-mono text-[11px] text-muted-foreground",
                          )}
                          data-fact
                          title={relativeTime(m.created_at)}
                        >
                          {clockOf(m.created_at)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      <Pager
        start={start}
        pageSize={shown || PAGE_TARGET}
        total={filtered.length}
        page={current}
        pageCount={pageCount}
        onPage={setPage}
      />
    </div>
  );
}
