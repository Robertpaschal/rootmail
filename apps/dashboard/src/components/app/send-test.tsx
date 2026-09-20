"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Beaker, Check, ChevronDown, Mail, ShieldCheck } from "lucide-react";
import type { TestRecipient } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SendActivity } from "./send-activity";
import { popupPlacement } from "@/lib/ui-motion";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [placement, setPlacement] = useState<{ up: boolean; width: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!triggerRef.current || !rootRef.current) return;
      const toolbar = document.querySelector(".dashboard-topbar")?.getBoundingClientRect();
      const next = popupPlacement(triggerRef.current.getBoundingClientRect(), {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        topInset: Math.max(12, toolbar?.bottom ?? 0) + 12,
      }, openUp);
      setPlacement({ ...next, left: next.left - rootRef.current.getBoundingClientRect().left });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, openUp]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const send = async (to: string) => {
    if (busy || disabled) return;
    setBusy(to);
    setError(null);
    try {
      const err = await onSend(to);
      if (err) return setError(err);
      setSent(to);
      setTimeout(() => setSent(null), 4000);
      setOpen(false);
      triggerRef.current?.focus();
    } catch {
      setError("We couldn't confirm the request. Check Messages before trying again.");
    } finally { setBusy(null); }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="ui-button inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        <Beaker className="size-3.5" /> Send a test
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {sent ? (
        <span role="status" className="ml-2 inline-flex items-center gap-1 text-xs text-witnessed">
          <Check className="ui-confirm-icon size-3.5" /> Queued for {sent}
        </span>
      ) : null}

        {open ? (
          <div
            id={menuId}
            style={placement ? { left: placement.left, right: "auto", width: placement.width, maxHeight: placement.maxHeight } : undefined}
            className={cn(
              "ui-menu-enter absolute left-0 z-30 max-h-[min(32rem,70dvh)] w-80 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-lg border bg-popover shadow-lg sm:left-auto sm:right-0",
              (placement?.up ?? openUp) ? "ui-menu-enter-up bottom-full mb-2" : "top-full mt-2",
            )}
          >
            {myEmail ? (
              <button
                type="button"
                disabled={busy != null}
                aria-busy={busy === myEmail}
                onClick={() => send(myEmail)}
                className="flex w-full items-start gap-2.5 border-b p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded border border-rule text-ink-muted">
                  {busy === myEmail ? <SendActivity pending className="size-3.5" /> : <Mail className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{busy === myEmail ? "Queueing test…" : "Send it to me"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    A real email to {myEmail} — see exactly how it lands.
                  </span>
                </span>
              </button>
            ) : null}

            <div className="p-2">
              <p className="flex items-center gap-1.5 px-1 pb-1.5 pt-1 text-[12.5px] font-medium text-muted-foreground">
                <ShieldCheck className="size-3" />
                Force an outcome — real send, safe address
              </p>
              {recipients.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  disabled={busy != null}
                  aria-busy={busy === r.email}
                  onClick={() => send(r.email)}
                  className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
                >
                  <span className="mt-0.5 shrink-0">
                    {busy === r.email ? (
                      <SendActivity pending className="size-3.5 text-muted-foreground" />
                    ) : (
                      <span
                        className={cn(
                          "block size-2 rounded-full",
                          r.outcome === "bounced" || r.outcome === "complained"
                            ? "bg-stopped"
                            : r.outcome === "suppressed"
                              ? "bg-acted"
                              : "bg-witnessed",
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{busy === r.email ? "Queueing test…" : r.label}</span>
                    <span className="block text-[12.5px] leading-snug text-muted-foreground">{r.description}</span>
                  </span>
                </button>
              ))}
              <p className="px-1 pb-1 pt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                These take the same live path as real mail — and never affect your sending reputation.
              </p>
            </div>

            {error ? <p role="alert" className="border-t bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}
    </div>
  );
}
