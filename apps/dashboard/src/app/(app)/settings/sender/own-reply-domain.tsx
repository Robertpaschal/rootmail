"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, CheckCircle2, Copy, Globe, Loader2, Trash2, X } from "lucide-react";
import { setReplyDomainAction, verifyReplyDomainAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Organization, ReplyDomainCheck } from "@/lib/types";

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function OwnReplyDomain({ initial }: { initial: Organization }) {
  const [org, setOrg] = useState(initial);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [checks, setChecks] = useState<ReplyDomainCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const status = org.reply_domain_status;

  const add = () => {
    const d = input.trim().toLowerCase();
    if (!d) return;
    setError(null);
    start(async () => {
      const r = await setReplyDomainAction(d);
      if (r.error) return setError(r.error);
      if (r.org) {
        setOrg(r.org);
        setChecks(null);
      }
    });
  };
  const remove = () => {
    setError(null);
    start(async () => {
      const r = await setReplyDomainAction(null);
      if (r.error) return setError(r.error);
      if (r.org) {
        setOrg(r.org);
        setChecks(null);
        setRevealed(false);
        setInput("");
      }
    });
  };
  const verify = () => {
    setError(null);
    start(async () => {
      const r = await verifyReplyDomainAction();
      if (r.error) return setError(r.error);
      setChecks(r.checks ?? null);
      if (r.org) setOrg(r.org);
    });
  };

  // Not set up yet — view-first reveal.
  if (status === "none") {
    if (!revealed) {
      return (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left text-sm hover:bg-accent/50"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Globe className="size-4" />
          </span>
          <span className="flex-1">
            <span className="font-medium">Use your own domain for replies</span>
            <span className="block text-xs text-muted-foreground">
              Recipients reply to <span className="font-mono">reply.yourcompany.com</span> instead of a rootmail address — fully your brand.
            </span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </button>
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="reply.yourcompany.com" autoFocus />
          <div className="flex gap-2">
            <Button onClick={add} disabled={busy || !input.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Add domain
            </Button>
            <Button variant="ghost" onClick={() => setRevealed(false)} disabled={busy}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick a subdomain you don&apos;t use for other mail (a dedicated <span className="font-mono">reply.</span> subdomain is ideal).
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  // Configured (pending or active).
  const records = org.reply_dns_records;
  const checkFor = (host: string, type: string) => checks?.find((c) => c.host === host && c.type === type);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">{org.reply_domain}</p>
          {status === "active" ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Live — replies arrive on your domain and land in the inbox.
            </p>
          ) : org.reply_domain_verified ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <CheckCircle2 className="size-3.5" /> DNS verified — we&apos;re switching on receiving for it (usually within a business day).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Add the two records below, then verify.</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>

      {status !== "active" ? (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name / Host</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const c = checkFor(r.host, r.type);
                  return (
                    <tr key={`${r.type}-${r.host}`} className="border-t align-top">
                      <td className="px-3 py-2 font-mono">
                        {r.type}
                        {r.priority != null ? <span className="text-muted-foreground"> · pri {r.priority}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="break-all font-mono">{r.host}</span>
                          <CopyValue value={r.host} />
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className="break-all font-mono">{r.value}</span>
                          <CopyValue value={r.value} />
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{r.detail}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c ? (
                          c.ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="size-3.5" /> Found</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive"><X className="size-3.5" /> Missing</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={verify} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Verify DNS
            </Button>
            <span className="text-xs text-muted-foreground">DNS changes can take a little while to propagate. Until it&apos;s live, replies keep coming to your rootmail inbox.</span>
          </div>
        </>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
