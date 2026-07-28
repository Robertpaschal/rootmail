"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Split, Users } from "lucide-react";
import { EmailPreview } from "@/components/app/email-preview";
import { Card, CardContent } from "@/components/ui/card";
import type { CampaignPreviewRecipient } from "@/lib/types";
import type { PreviewPerson } from "@/lib/sample-vars";
import { cn } from "@/lib/utils";

/**
 * Pre-flight: read the actual email each person is about to receive.
 *
 * A campaign is the one send where you can't check afterwards — it reaches
 * everyone at once. So before it goes, step through the audience and read their
 * copy: their name, their custom fields, and the A/B variant their tags select.
 * Every line here is resolved by the SAME rules the worker applies, server-side,
 * so this is the email, not an approximation of it.
 */
export function PreFlight({
  recipients,
  total,
  fromLabel,
}: {
  recipients: CampaignPreviewRecipient[];
  /** How many people the campaign actually reaches (may exceed what we loaded). */
  total: number;
  fromLabel: string;
}) {
  const [i, setI] = useState(0);
  const current = recipients[i];

  if (recipients.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Users className="size-4 shrink-0" />
          No one is in this audience yet, so there&apos;s nothing to preview.
        </CardContent>
      </Card>
    );
  }

  // EmailPreview's picker speaks PreviewPerson; each recipient's copy is already
  // rendered server-side, so no variables are left to substitute here.
  const people: PreviewPerson[] = recipients.map((r) => ({ email: r.email, name: r.name, real: true }));
  const person = people[i];
  const variantCount = new Set(recipients.map((r) => r.variant_tag ?? "")).size;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4 text-primary" /> Check it before it goes
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Their actual copy — name, custom fields and A/B variant resolved exactly as the send will.
              {total > recipients.length ? ` Showing ${recipients.length} of ${total.toLocaleString()}.` : ""}
            </p>
          </div>
          {variantCount > 1 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <Split className="size-3" /> {variantCount} versions in play
            </span>
          ) : null}
        </div>

        {/* Who's who — a compact strip you can arrow through. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {recipients.map((r, idx) => (
            <button
              key={r.email}
              type="button"
              onClick={() => setI(idx)}
              className={cn(
                "relative shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                idx === i ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.name ?? r.email}
              {r.variant_tag ? (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide">
                  {r.variant_tag}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.email}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            <p className="mb-2 text-xs text-muted-foreground">
              Gets the <span className="font-medium text-foreground">{current.template_name}</span> template
              {current.variant_tag ? (
                <>
                  {" "}
                  because they&apos;re tagged <span className="font-medium text-foreground">“{current.variant_tag}”</span>
                </>
              ) : null}
              .
            </p>
            <EmailPreview
              html={current.html}
              text={current.text}
              subject={current.subject}
              fromLabel={fromLabel}
              person={person}
              // Already rendered server-side — nothing left to fill in.
              variables={{}}
              people={people}
              onPickPerson={(p) => setI(people.findIndex((x) => x.email === p.email))}
            />
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
