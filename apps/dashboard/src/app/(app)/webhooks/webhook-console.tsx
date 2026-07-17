"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Copy, Loader2, Plus, ShieldCheck, Trash2, Webhook, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { type CreateState, createWebhook, deleteWebhook, loadDeliveries, setWebhookStatus } from "./actions";
import { EmptyState } from "@/components/app/empty-state";
import { Reveal } from "@/components/app/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { relativeTime } from "@/lib/format";
import type { WebhookDelivery, WebhookEndpoint } from "@/lib/types";

const EVENTS = [
  "message.sent",
  "message.delivered",
  "message.opened",
  "message.clicked",
  "message.bounced",
  "message.complained",
  "message.failed",
  "message.suppressed",
  "message.received",
];

export function WebhookConsole({ initial }: { initial: WebhookEndpoint[] }) {
  const [state, action, pending] = useActionState<CreateState | null, FormData>(createWebhook, null);
  const [adding, setAdding] = useState(false);
  const empty = initial.length === 0;

  useEffect(() => {
    if (state?.created) setAdding(false);
  }, [state?.created]);

  return (
    <Reveal className="space-y-6">
      {/* The signing-secret reveal appears once, right after creation. */}
      <AnimatePresence>
        {state?.created ? (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 dark:bg-emerald-950/30">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Endpoint created. Copy your signing secret now — it won&apos;t be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border bg-background px-2 py-1.5 font-mono text-xs">{state.created.secret}</code>
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(state.created!.secret); toast.success("Secret copied."); }}>
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
              <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-400/80">
                Verify each delivery with it — the <code className="font-mono">Rootmail-Signature</code> header is an HMAC of the raw body.{" "}
                <Link href="/docs/webhooks" className="font-medium underline">See the verify snippet in the docs</Link>.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {empty ? "Webhooks push message events to your server in real time." : `${initial.length} endpoint${initial.length === 1 ? "" : "s"}`}
        </p>
        {!empty ? (
          !adding ? (
            <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add endpoint</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}><X className="size-4" /> Cancel</Button>
          )
        ) : null}
      </div>

      {/* Empty: teach what webhooks do + the signed model, then reveal the form. */}
      {empty && !adding ? (
        <div className="space-y-6">
          <EmptyState
            icon={<Webhook className="size-6" />}
            title="No endpoints yet"
            description="Get a POST to your server the instant something happens — delivered, opened, clicked, bounced, a reply received — so your product reacts without polling."
            action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add your first endpoint</Button>}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, title: "Real-time events", body: "Nine event types, from message.sent to message.received (inbound replies). Subscribe to all or a subset." },
              { icon: ShieldCheck, title: "Signed & verifiable", body: "Every delivery carries a Rootmail-Signature HMAC of the raw body — so you can trust it came from us." },
              { icon: ArrowRight, title: "Retried & observable", body: "Failed deliveries retry with backoff; the delivery log here shows every attempt and its response." },
            ].map((s) => (
              <Card key={s.title}><CardContent className="p-5">
                <span className="mb-3 grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><s.icon className="size-4" /></span>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
              </CardContent></Card>
            ))}
          </div>
          <Link href="/docs/webhooks" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            The full webhooks reference — payloads + signature verification <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      {/* Create form — revealed on demand. */}
      <AnimatePresence initial={false}>
        {adding ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <Card className="border-primary/30">
              <CardContent className="p-5">
                <form action={action} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="url">Where should we POST?</Label>
                      <Input id="url" name="url" type="url" placeholder="https://api.yourapp.com/rootmail/webhooks" required autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description">Label (optional)</Label>
                      <Input id="description" name="description" placeholder="Production receiver" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Which events?</Label>
                    <div className="grid grid-cols-2 gap-1.5 rounded-md border p-2 sm:grid-cols-3">
                      {EVENTS.map((ev) => (
                        <label key={ev} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-secondary/60">
                          <input type="checkbox" name="events" value={ev} className="size-3.5 accent-primary" /> <span className="font-mono">{ev}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Leave all unchecked to receive every event.</p>
                  </div>
                  {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Create endpoint
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Existing endpoints — view-first. */}
      {!empty ? (
        <div className="space-y-4">
          {initial.map((e) => <EndpointCard key={e.id} endpoint={e} />)}
        </div>
      ) : null}
    </Reveal>
  );
}

function EndpointCard({ endpoint }: { endpoint: WebhookEndpoint }) {
  const [pending, startTransition] = useTransition();
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = () =>
    startTransition(async () => {
      const res = await setWebhookStatus(endpoint.id, endpoint.status === "active" ? "disabled" : "active");
      if (res.error) toast.error(res.error);
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteWebhook(endpoint.id);
      if (res.error) toast.error(res.error);
      else toast.success("Endpoint deleted.");
    });

  const showDeliveries = () =>
    startTransition(async () => {
      if (!open) {
        const res = await loadDeliveries(endpoint.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setDeliveries(res.deliveries ?? []);
      }
      setOpen((o) => !o);
    });

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm" title={endpoint.url}>
              {endpoint.url}
            </p>
            {endpoint.description ? (
              <p className="text-xs text-muted-foreground">{endpoint.description}</p>
            ) : null}
          </div>
          <Badge variant={endpoint.status === "active" ? "success" : "muted"}>{endpoint.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {endpoint.events.map((ev) => (
            <Badge key={ev} variant="secondary" className="font-mono text-[10px]">
              {ev}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
            {endpoint.status === "active" ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={showDeliveries} disabled={pending}>
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /> Deliveries
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            aria-label="Delete endpoint"
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        {open ? (
          <div className="rounded-md border">
            {deliveries && deliveries.length > 0 ? (
              <ul className="divide-y text-xs">
                {deliveries.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono">{d.event}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={d.status === "success" ? "success" : "destructive"} className="text-[10px]">
                        {d.status}
                        {d.response_status ? ` ${d.response_status}` : ""}
                      </Badge>
                      <span className="text-muted-foreground">{relativeTime(d.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No deliveries yet.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
