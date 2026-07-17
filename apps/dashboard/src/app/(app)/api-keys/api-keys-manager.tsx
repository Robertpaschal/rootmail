"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, KeyRound, Loader2, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { createApiKey, revokeApiKey } from "./actions";
import { CopyButton } from "@/components/app/copy-button";
import { EmptyState } from "@/components/app/empty-state";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import type { ApiKey } from "@/lib/types";

interface Props {
  keys: ApiKey[];
  currentKey: { prefix: string; last4: string } | null;
}

export function ApiKeysManager({ keys, currentKey }: Props) {
  const [state, formAction] = useActionState(createApiKey, null);
  const [creating, setCreating] = useState(false);
  const active = keys.filter((k) => !k.revoked);
  const empty = active.length === 0;

  // A fresh secret shows the one-time reveal (and closes the form).
  useEffect(() => {
    if (state?.secret) setCreating(false);
  }, [state?.secret]);

  const isCurrent = (k: ApiKey) => currentKey != null && k.prefix === currentKey.prefix && k.last4 === currentKey.last4;

  return (
    <div className="space-y-6">
      {/* One-time secret reveal — the only moment the full key is visible. */}
      <AnimatePresence>
        {state?.secret ? (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="rounded-xl border border-amber-400/50 bg-amber-50 p-4 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
                <ShieldAlert className="size-4" /> Copy your key now — you won&apos;t be able to see it again.
              </div>
              {state.name ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-400/80">For &ldquo;{state.name}&rdquo;</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-sm">{state.secret}</code>
                <CopyButton value={state.secret} />
              </div>
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-400/80">
                Pass it as a Bearer token. See <Link href="/docs/authentication" className="font-medium underline">Authentication</Link> in the docs.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* View-first: keys OR an inviting empty state, with creation on demand. */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div>
              <p className="text-sm font-semibold">Your API keys</p>
              <p className="text-xs text-muted-foreground">Keys inherit this workspace&apos;s mode — test keys hit the sandbox, live keys send real mail.</p>
            </div>
            {!creating ? (
              <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> Create key</Button>
            ) : (
              <button type="button" onClick={() => setCreating(false)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Cancel"><X className="size-4" /></button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {creating ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <form action={formAction} className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-end">
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor="name">Name it — so you know where it&apos;s used</Label>
                    <Input id="name" name="name" placeholder="Production server, Zapier, my-cli…" required autoFocus />
                  </div>
                  <SubmitButton pendingLabel="Creating…"><Plus className="size-4" /> Create key</SubmitButton>
                </form>
                {state?.error ? <p className="border-b bg-muted/20 px-5 pb-3 text-sm text-destructive">{state.error}</p> : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {empty && !creating ? (
            <div className="p-6">
              <EmptyState
                icon={<KeyRound className="size-6" />}
                title="No API keys yet"
                description="You don't need one to send from the dashboard — keys are for integrating the REST API, the @rootmail/node SDK, or the CLI. Create one when you're ready to wire rootmail into your product."
                action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> Create your first key</Button>}
              />
            </div>
          ) : keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} className={k.revoked ? "opacity-55" : undefined}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {k.name}
                        {isCurrent(k) ? <Badge variant="outline" className="text-xs font-normal">In use</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{k.prefix}_…{k.last4}</TableCell>
                    <TableCell><Badge variant={k.mode === "live" ? "secondary" : "outline"}>{k.mode}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{k.last_used_at ? relativeTime(k.last_used_at) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {k.revoked ? <Badge variant="destructive">Revoked</Badge> : isCurrent(k) ? <span className="text-xs text-muted-foreground">—</span> : <RevokeButton id={k.id} name={k.name} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {/* How-to lives in the docs (one source of truth), not duplicated here. */}
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><BookOpen className="size-5" /></span>
            <div>
              <p className="text-sm font-medium">How to send with your key</p>
              <p className="text-xs text-muted-foreground">Quickstart, the REST reference, SDK, and CLI — with copy-paste examples.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/docs/quickstart" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">Quickstart <ArrowRight className="size-3.5" /></Link>
            <Link href="/docs/authentication" className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Authentication</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RevokeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${name}"? Anything using this key will stop working immediately.`)) return;
        const fd = new FormData();
        fd.set("id", id);
        start(() => revokeApiKey(fd));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Revoke
    </Button>
  );
}
