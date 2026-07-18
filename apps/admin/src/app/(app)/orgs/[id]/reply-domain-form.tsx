"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setReplyDomainStatus } from "./actions";

// Staff fulfillment for a branded reply domain: once the customer's DNS is
// verified, provision the SES receipt rule for it, then flip to "active" so
// reply-to starts using their domain. Only shows once a customer has added one.
export function ReplyDomainForm({
  orgId,
  domain,
  status,
  verified,
}: {
  orgId: string;
  domain: string | null;
  status: "none" | "pending" | "active";
  verified: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "none" || !domain) return null;

  const set = (next: "none" | "pending" | "active") =>
    start(async () => {
      setError(null);
      const res = await setReplyDomainStatus(orgId, next);
      if (res.error) setError(res.error);
    });

  return (
    <div className="rounded-lg border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Globe className="size-4 text-muted-foreground" /> Reply domain
        <Badge variant={status === "active" ? "success" : "warning"}>{status}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{domain}</span>
      </p>

      {status === "pending" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {verified
              ? "Customer's DNS is verified. Create the SES receipt rule for this subdomain, then mark it active."
              : "Waiting on the customer's DNS (MX + TXT). It must be verified before you can activate."}
          </p>
          <Button type="button" size="sm" disabled={pending || !verified} onClick={() => set("active")}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Mark active
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => set("pending")}>
            Revert to pending
          </Button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
