import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import type { CustomerOutreach } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * What WE have sent this customer, and how it landed.
 *
 * Read out of rootmail's own workspace — the same messages, statuses and
 * contact record any customer sees for their own sends. There is deliberately
 * no composer here and no send button: the moment staff can mail from the admin
 * console we are maintaining two email products, and only one of them gets the
 * deliverability work. This shows, and links to the real thing.
 *
 * Also the most direct answer to "why has this customer gone quiet?" — a
 * complaint or a bounce on our own list is right here, and it explains a
 * customer who stopped hearing from us long before anyone thinks to ask.
 */

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  queued: "bg-white/10 text-white/60",
  suppressed: "bg-amber-500/15 text-amber-400",
  bounced: "bg-red-500/15 text-red-400",
  complained: "bg-red-500/15 text-red-400",
  failed: "bg-red-500/15 text-red-400",
};

/** Security mail is the one a suppression must never stop — say so where a
 *  staff member is looking at why mail did or didn't go. */
const KIND_LABEL: Record<string, string> = {
  security: "Security",
  transactional: "Account",
  marketing: "Marketing",
};

export function CustomerOutreachPanel({
  outreach,
  dashboardUrl,
}: {
  outreach: CustomerOutreach;
  dashboardUrl: string;
}) {
  const { contact, messages, suppressions = [] } = outreach;
  const blocking = suppressions.filter((s) => s.reason !== "unsubscribe");

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Our email to them</h3>
          <p className="mt-0.5 text-xs text-white/50">
            Sent through rootmail, like any customer&apos;s. Compose and reply in the dashboard —
            this is the record.
          </p>
        </div>
        {contact ? (
          <Link
            href={`${dashboardUrl}/contacts/${contact.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          >
            Open their contact <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </header>

      <div className="space-y-4 p-5">
        {/* Why they may have stopped hearing from us. */}
        {blocking.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="min-w-0 text-xs">
              <p className="font-medium text-amber-300">
                We are suppressing this address ({blocking.map((s) => s.reason).join(", ")}).
              </p>
              <p className="mt-0.5 text-amber-200/70">
                Account and marketing email stops. Security email — password resets, sign-in
                warnings — still reaches them, by design.
              </p>
            </div>
          </div>
        ) : null}

        {contact ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
            <span>
              In our audience as{" "}
              <span className="font-medium text-white/85">{outreach.email}</span>
            </span>
            <span className={cn(contact.status !== "active" && "text-amber-400")}>
              {contact.status}
            </span>
            {contact.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-white/45">
            Not in our audience yet — they appear once the customer sync has run.
          </p>
        )}

        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-xs text-white/45">
            We haven&apos;t sent this customer anything yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                {m.kind === "security" ? (
                  <ShieldCheck className="size-3.5 shrink-0 text-white/35" />
                ) : (
                  <Mail className="size-3.5 shrink-0 text-white/25" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs">{m.subject}</span>
                {m.kind ? (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/55">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    STATUS_TONE[m.status] ?? "bg-white/10 text-white/60",
                  )}
                  title={m.error ?? undefined}
                >
                  {m.status}
                </span>
                <span className="shrink-0 text-[10px] text-white/35">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
