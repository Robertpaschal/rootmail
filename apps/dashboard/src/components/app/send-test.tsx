"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Beaker, Check, ChevronDown, Loader2, Mail, ShieldCheck } from "lucide-react";
import type { TestRecipient } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "Send a test" — the honest replacement for a simulated sandbox.
 *
 * Two audiences, one control:
 *  • **To myself** — a real send to the signed-in user's own address. What a
 *    non-technical user actually wants: see it land, in a real inbox, rendered
 *    by a real mail client.
 *  • **A test scenario** — a real send to a reserved address that forces a
 *    known outcome (clean delivery, hard bounce, spam complaint…). Same live
 *    path, same DKIM, same webhooks, but it lands on the provider's mailbox
 *    simulator and never touches sender reputation.
 *
 * Both are REAL sends. Nothing here is simulated, which is the whole point.
 */
export function SendTest({
  recipients,
  myEmail,
  onSend,
  disabled,
  className,
  /** Open upward — for a control that sits in a bottom send bar. */
  openUp = false,
}: {
  recipients: TestRecipient[];
  /** The signed-in user's address — the "to myself" destination. */
  myEmail: string | null;
  /** Perform the send. Resolves with an error message, or null on success. */
  onSend: (to: string) => Promise<string | null>;
  disabled?: boolean;
  className?: string;
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (to: string) => {
    setBusy(to);
    setError(null);
    const err = await onSend(to);
    setBusy(null);
    if (err) return setError(err);
    setSent(to);
    setTimeout(() => setSent(null), 4000);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        <Beaker className="size-3.5" /> Send a test
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {sent ? (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" /> Sent to {sent}
        </span>
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: openUp ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: openUp ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute right-0 z-30 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg",
              openUp ? "bottom-full mb-2" : "mt-2",
            )}
          >
            {myEmail ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => send(myEmail)}
                className="flex w-full items-start gap-2.5 border-b p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {busy === myEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Send it to me</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    A real email to {myEmail} — see exactly how it lands.
                  </span>
                </span>
              </button>
            ) : null}

            <div className="p-2">
              <p className="flex items-center gap-1.5 px-1 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
                <ShieldCheck className="size-3" />
                Force an outcome — real send, safe address
              </p>
              {recipients.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  disabled={busy != null}
                  onClick={() => send(r.email)}
                  className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
                >
                  <span className="mt-0.5 shrink-0">
                    {busy === r.email ? (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        className={cn(
                          "block size-2 rounded-full",
                          r.outcome === "bounced" || r.outcome === "complained"
                            ? "bg-red-500"
                            : r.outcome === "suppressed"
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{r.description}</span>
                  </span>
                </button>
              ))}
              <p className="px-1 pb-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
                These take the same live path as real mail — and never affect your sending reputation.
              </p>
            </div>

            {error ? <p className="border-t bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
