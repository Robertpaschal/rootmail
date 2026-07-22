"use client";

import { useState, useTransition } from "react";
import { Loader2, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDedicatedIp } from "./actions";

// Staff fulfillment for the dedicated-IP add-on: move requested → active once the
// real SES dedicated IP exists, recording the address. Only appears once a customer
// has purchased (status left "none" otherwise).
export function DedicatedIpForm({
  orgId,
  status,
  address,
  configSet,
}: {
  orgId: string;
  status: "none" | "requested" | "active";
  address: string | null;
  configSet: string | null;
}) {
  const [pending, start] = useTransition();
  const [ip, setIp] = useState(address ?? "");
  const [cfg, setCfg] = useState(configSet ?? "");
  const [error, setError] = useState<string | null>(null);

  if (status === "none") return null;

  const set = (next: "none" | "requested" | "active", addr?: string, cs?: string) =>
    start(async () => {
      setError(null);
      const res = await setDedicatedIp(orgId, next, addr ?? null, cs ?? null);
      if (res.error) setError(res.error);
    });

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Server className="size-4 text-muted-foreground" /> Dedicated IP
          <Badge variant={status === "active" ? "success" : "warning"}>
            {status === "active" ? "active" : "requested"}
          </Badge>
        </p>
      </div>

      {status === "requested" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Customer purchased a dedicated IP. In SES: buy the IP, put it in a dedicated pool, and
            create a configuration set that routes through that pool <strong>with the same SNS event
            destinations as the shared set</strong> (or delivery/open/click events are lost). Then
            record the address + config set to activate — the worker only routes through the IP once
            a config set is set.
          </p>
          <div className="grid gap-2 sm:max-w-md">
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP address — e.g. 23.251.x.x" />
            <Input value={cfg} onChange={(e) => setCfg(e.target.value)} placeholder="SES configuration set — e.g. rootmail-ded-acme" />
            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={pending || !ip.trim() || !cfg.trim()}
              onClick={() => set("active", ip.trim(), cfg.trim())}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Mark active
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm">{address ?? "—"}</span>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => set("requested")}>
              Revert to requested
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Routing through <span className="font-mono">{configSet ?? "— (shared set — not actually dedicated!)"}</span>
          </p>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
