"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createSubTenant, type CreateState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateSubTenantForm() {
  const [state, formAction, pending] = useActionState<CreateState | null, FormData>(
    createSubTenant,
    null,
  );

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">New client domain</CardTitle>
        <CardDescription>Provision a client&apos;s sending domain — you&apos;ll get DNS records to publish.</CardDescription>
      </CardHeader>
      <CardContent>
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
            {pending ? "Creating…" : "Create sub-tenant"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
