import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/app/status-badge";
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
 *
 * It used to keep its OWN status→colour map (emerald for delivered, red for
 * bounced) beside the dashboard's. Two maps mean two laws, and this one had
 * already drifted: it painted `delivered` and an inferred state the same green.
 * The chips are `<StatusBadge>` now — the same component, and therefore the
 * same rendering law, staff see in a customer's own console. The ground, rule
 * and ink are tokens rather than `white/10`, which had no meaning and could not
 * follow the ground.
 */

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
    <section className="rounded-lg border bg-card shadow-e1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-heading">Our email to them</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Sent through rootmail, like any customer&apos;s. Compose and reply in the dashboard —
            this is the record.
          </p>
        </div>
        {contact ? (
          <Link
            href={`${dashboardUrl}/contacts/${contact.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brass/40 px-2.5 py-1.5 text-xs font-medium text-brass-text transition-colors duration-interaction ease-interaction hover:bg-brass/10"
          >
            Open their contact <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </header>

      <div className="space-y-4 p-5">
        {/* Why they may have stopped hearing from us. A suppression is
            something WE did, which is what `acted` means — not a warning
            about something that happened to us. */}
        {blocking.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-acted/30 bg-acted-tint p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-acted" />
            <div className="min-w-0 text-xs">
              <p className="font-medium text-acted">
                We are suppressing this address ({blocking.map((s) => s.reason).join(", ")}).
              </p>
              <p className="mt-0.5 text-ink-muted">
                Account and marketing email stops. Security email — password resets, sign-in
                warnings — still reaches them, by design.
              </p>
            </div>
          </div>
        ) : null}

        {contact ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              In our audience as <span className="font-medium text-ink">{outreach.email}</span>
            </span>
            <span className={cn(contact.status !== "active" && "font-medium text-acted")}>
              {contact.status}
            </span>
            {contact.tags.slice(0, 4).map((t) => (
              <Badge key={t} variant="muted">
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-ink-muted">
            Not in our audience yet — they appear once the customer sync has run.
          </p>
        )}

        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-ink-muted">
            We haven&apos;t sent this customer anything yet.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                {m.kind === "security" ? (
                  <ShieldCheck className="size-3.5 shrink-0 text-ink-muted" />
                ) : (
                  <Mail className="size-3.5 shrink-0 text-ink-muted/60" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs">{m.subject}</span>
                {m.kind ? (
                  <Badge variant="muted" className="shrink-0 text-[12px]">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </Badge>
                ) : null}
                <span className="shrink-0" title={m.error ?? undefined}>
                  <StatusBadge status={m.status} />
                </span>
                <time className="shrink-0 font-mono text-[12px] text-ink-muted">
                  {new Date(m.created_at).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
