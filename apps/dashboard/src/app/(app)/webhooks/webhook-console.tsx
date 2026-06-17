"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type CreateState, createWebhook, deleteWebhook, loadDeliveries, setWebhookStatus } from "./actions";
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {initial.length === 0 ? (
          <p className="text-sm text-muted-foreground">No endpoints yet. Add one to start receiving events.</p>
        ) : (
          initial.map((e) => <EndpointCard key={e.id} endpoint={e} />)
        )}
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold">Add an endpoint</h3>
          {state?.created ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium text-emerald-600">Endpoint created.</p>
              <p className="text-xs text-muted-foreground">
                Copy your signing secret now — it won&apos;t be shown again.
              </p>
              <code className="block break-all rounded bg-background px-2 py-1 font-mono text-xs">
                {state.created.secret}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(state.created!.secret);
                  toast.success("Secret copied.");
                }}
              >
                <Copy className="size-3.5" /> Copy secret
              </Button>
            </div>
          ) : (
            <form action={action} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="url">Endpoint URL</Label>
                <Input id="url" name="url" type="url" placeholder="https://example.com/webhooks" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" name="description" placeholder="Production receiver" />
              </div>
              <div className="space-y-1.5">
                <Label>Events</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="events" value={ev} className="size-3.5" /> {ev}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Leave all unchecked to receive every event.</p>
              </div>
              {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add endpoint
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
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
