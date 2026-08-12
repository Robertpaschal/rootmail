import type { Metadata } from "next";
import { AlertTriangle, Inbox, Mail, ShieldOff, Users } from "lucide-react";
import { OpenDoor } from "./open-door";
import { PageHeader } from "@/components/app/page-header";
import { adminApi } from "@/lib/admin-api";
import type { InternalSummary } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Our workspace" };
export const dynamic = "force-dynamic";

/**
 * rootmail's own rootmail account.
 *
 * We sell a product for reaching customers by email, and for a long time
 * reached our own customers with something else — a bespoke sender bolted onto
 * this console, invisible to our own deliverability page, unable to receive a
 * reply. That is the sharpest version of not trusting your own product.
 *
 * So: we are a tenant of ourselves. The numbers below are read from our own
 * workspace with the same tables that answer a customer's dashboard, and every
 * ACTION is a door into the real product. Nothing here is a staff-only
 * capability. If reaching our customers is awkward, it is awkward for everyone
 * paying us, and we will feel it first.
 */

const STATUS_TONE: Record<string, string> = {
  sent: "text-emerald-500",
  delivered: "text-emerald-500",
  queued: "text-muted-foreground",
  suppressed: "text-amber-500",
  bounced: "text-destructive",
  complained: "text-destructive",
  failed: "text-destructive",
};

const KIND_LABEL: Record<string, string> = {
  security: "Security",
  transactional: "Account",
  marketing: "Marketing",
};

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default async function OurWorkspacePage() {
  let s: InternalSummary | null = null;
  let error = "";
  try {
    s = await adminApi.internalSummary();
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't read our workspace.";
  }

  const bad = (s?.sends_30d.bounced ?? 0) + (s?.sends_30d.complained ?? 0);
  const total = s?.sends_30d.total ?? 0;
  const badRate = total > 0 ? (bad / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Our workspace"
        description="rootmail is a customer of rootmail. Our customer email lives in a real workspace, sends through the real pipeline, and is managed in the real dashboard — not in here."
        actions={<OpenDoor compact />}
      />

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Users}
              label="Customers reachable"
              value={s.audience.active.toLocaleString()}
              sub={
                s.audience.total !== s.audience.active
                  ? `${(s.audience.total - s.audience.active).toLocaleString()} unsubscribed or bounced`
                  : "everyone in our audience"
              }
            />
            <Stat
              icon={Mail}
              label="Sent to them · 30d"
              value={total.toLocaleString()}
              sub={
                s.sends_30d.tests > 0
                  ? `${s.sends_30d.sent.toLocaleString()} delivered · ${s.sends_30d.tests.toLocaleString()} test ${s.sends_30d.tests === 1 ? "send" : "sends"} not counted`
                  : `${s.sends_30d.sent.toLocaleString()} delivered`
              }
            />
            <Stat
              icon={AlertTriangle}
              label="Bounced or complained"
              value={bad.toLocaleString()}
              sub={total > 0 ? `${badRate.toFixed(1)}% of real sends` : "nothing sent yet"}
              tone={badRate >= 2 ? "text-destructive" : undefined}
            />
            <Stat
              icon={Inbox}
              label="Replies waiting"
              value={s.open_threads.toLocaleString()}
              sub={s.open_threads > 0 ? "open threads in our inbox" : "nothing unanswered"}
            />
          </div>

          {/* We hold customers to CAN-SPAM. The address is left empty rather
              than invented, so this is the nudge that gets a real one in. */}
          {!s.postal_address ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-medium">Our marketing footers have no postal address.</span>{" "}
                CAN-SPAM requires one on commercial email — the same rule we enforce for every
                customer. Add rootmail&apos;s real address in the dashboard under Settings →
                Business.
              </p>
            </div>
          ) : null}

          {/* The bounce rate that matters is our own. Say it where staff look. */}
          {badRate >= 2 ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                <span className="font-medium">Our own bounce and complaint rate is {badRate.toFixed(1)}%.</span>{" "}
                Above 2% is where mailbox providers start throttling — the same warning we show
                customers. Open Deliverability below.
              </p>
            </div>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Do it in the product</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Opens the dashboard signed in as rootmail. There is no composer in this console on
                purpose — two email products would mean one of them goes unloved.
              </p>
            </div>
            <OpenDoor />
          </section>

          <section className="rounded-lg border">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Last sent</h2>
              <span className="text-xs text-muted-foreground">
                {s.suppressed.toLocaleString()} address{s.suppressed === 1 ? "" : "es"} suppressed
              </span>
            </header>
            {s.recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                We haven&apos;t emailed a customer from this workspace yet.
              </p>
            ) : (
              <ul className="divide-y">
                {s.recent.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    {m.status === "suppressed" ? (
                      <ShieldOff className="size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <Mail className="size-3.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{m.subject}</span>
                    <span className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:block">
                      {m.to_email}
                    </span>
                    {m.kind ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {KIND_LABEL[m.kind] ?? m.kind}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        STATUS_TONE[m.status] ?? "text-muted-foreground",
                      )}
                    >
                      {m.status}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(m.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
