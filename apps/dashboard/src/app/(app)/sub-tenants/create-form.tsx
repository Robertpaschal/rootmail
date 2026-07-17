"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { createSubTenant, type CreateState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateSubTenantForm({ onDone }: { onDone?: () => void }) {
  const [state, formAction, pending] = useActionState<CreateState | null, FormData>(
    createSubTenant,
    null,
  );

  // On success the server action redirects to the new domain's detail page; if it
  // instead returns without error, collapse the panel.
  useEffect(() => {
    if (state && !state.error) onDone?.();
  }, [state, onDone]);

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">New client domain</p>
      <p className="mb-3 text-xs text-muted-foreground">Provision a client&apos;s sending domain — you&apos;ll get DNS records to publish next.</p>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="Sunset Villas" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sending_domain">Sending domain</Label>
            <Input
              id="sending_domain"
              name="sending_domain"
              placeholder="sunsetvillas.com"
              className="font-mono"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="external_id">External ID (optional)</Label>
            <Input id="external_id" name="external_id" placeholder="customer_8821" className="font-mono" />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {pending ? "Creating…" : "Create client domain"}
          </Button>
        </form>
    </div>
  );
}
