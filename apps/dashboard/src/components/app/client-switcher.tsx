"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Network, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubTenant, SubTenantStatus } from "@/lib/types";
import { actAsClient, exitClientScope } from "./client-scope-actions";

// One dot tells the domain's story at a glance; the label spells it out on hover.
const statusDot: Record<SubTenantStatus, { className: string; label: string }> = {
  verified: { className: "bg-witnessed", label: "Verified — sending live" },
  pending_verification: { className: "bg-acted", label: "Waiting on DNS records" },
  verifying: { className: "bg-acted", label: "Verifying DNS…" },
  failed: { className: "bg-stopped", label: "DNS check failed" },
  disabled: { className: "bg-muted-foreground/50", label: "Disabled" },
};

/**
 * Agency mode's front door: pick a client and the whole dashboard — messages,
 * replies, campaigns, audience, templates, insights — narrows to them. Lives in
 * the topbar next to the workspace switcher (workspace first, then the client
 * within it) and only renders when the workspace has client domains at all.
 */
export function ClientSwitcher({
  tenants,
  activeId,
  /** The cookie names a client that no longer exists. Showing "All clients"
   * here would be a lie — the requests ARE still scoped, they're just failing. */
  stale = false,
}: {
  tenants: SubTenant[];
  activeId: string | null;
  stale?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const active = activeId ? (tenants.find((t) => t.id === activeId) ?? null) : null;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: string | null) {
    if (id === (active?.id ?? null)) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = id ? await actAsClient(id) : await exitClientScope();
      if (res.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active ? `Viewing client ${active.name}` : stale ? "This client view no longer exists" : "View as a client"}
        className={cn(
          "inline-flex max-w-[13rem] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
          active && "border-ink bg-secondary text-foreground hover:bg-primary/15",
          !active && stale && "border-acted/50 bg-acted/10 text-acted hover:bg-acted/15",
          !active && !stale && "bg-background text-foreground hover:bg-accent",
        )}
      >
        <Network className="size-3.5 shrink-0" />
        <span className="truncate">{active ? active.name : stale ? "Client unavailable" : "All clients"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-70" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            View as
          </div>
          <ul className="max-h-72 overflow-y-auto px-1 pb-1">
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => choose(null)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60",
                  !active && !stale && "bg-accent/60",
                )}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="font-medium">Entire workspace</span>
                  <span className="text-xs text-muted-foreground">
                    Your own sending, plus every client&apos;s domains
                  </span>
                </span>
                {!active && !stale ? <Check className="size-4 shrink-0 text-primary" /> : null}
              </button>
            </li>
            {tenants.map((t) => {
              const dot = statusDot[t.status] ?? statusDot.disabled;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => choose(t.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60",
                      t.id === active?.id && "bg-accent/60",
                    )}
                  >
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{t.name}</span>
                        <span
                          className={cn("size-1.5 shrink-0 rounded-full", dot.className)}
                          title={dot.label}
                        />
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {t.sending_domain}
                      </span>
                    </span>
                    {t.id === active?.id ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t p-1">
            <Link
              href="/sub-tenants"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Settings2 className="size-4 text-muted-foreground" /> Manage client domains
            </Link>
            {error ? <p className="px-2 pb-1 text-[11px] text-destructive">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
