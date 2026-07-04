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
}: {
  orgId: string;
  status: "none" | "requested" | "active";
  address: string | null;
}) {
  const [pending, start] = useTransition();
  const [ip, setIp] = useState(address ?? "");
  const [error, setError] = useState<string | null>(null);

  if (status === "none") return null;

  const set = (next: "none" | "requested" | "active", addr?: string) =>
    start(async () => {
      setError(null);
      const res = await setDedicatedIp(orgId, next, addr ?? null);
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
            Customer purchased a dedicated IP. Provision it in SES, then record the address to mark
            it active.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="e.g. 23.251.x.x"
              className="w-48"
            />
            <Button type="button" size="sm" disabled={pending || !ip.trim()} onClick={() => set("active", ip.trim())}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Mark active
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm">{address ?? "—"}</span>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => set("requested")}>
            Revert to requested
          </Button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
