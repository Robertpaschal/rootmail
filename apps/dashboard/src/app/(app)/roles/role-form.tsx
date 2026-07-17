"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { type RoleFormState, createRole } from "./actions";
import { useRevealClose } from "@/components/app/reveal-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Friendly labels for the permission keys from the API catalog.
const LABELS: Record<string, string> = {
  read: "Read / view everything",
  "messages.send": "Send messages",
  "content.manage": "Manage content (templates, sequences, campaigns, lists, contacts)",
  "domains.manage": "Manage sub-tenants / domains",
  "webhooks.manage": "Manage webhooks",
  "members.manage": "Manage team & roles",
  "billing.manage": "Manage billing & plan",
  "apikeys.manage": "Manage API keys",
  "proof.read": "Read proof bundles",
};

export function RoleForm({ permissions }: { permissions: string[] }) {
  const [state, action, pending] = useActionState<RoleFormState | null, FormData>(createRole, null);
  const ref = useRef<HTMLFormElement>(null);
  const closeReveal = useRevealClose();
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      closeReveal();
    }
  }, [state, closeReveal]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Role name</Label>
        <Input id="name" name="name" placeholder="Marketer" required />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Permissions</legend>
        {permissions.map((p) => (
          <label key={p} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="permissions"
              value={p}
              defaultChecked={p === "read"}
              className="mt-0.5"
            />
            <span>
              <span className="font-mono text-xs">{p}</span>
              <span className="block text-xs text-muted-foreground">{LABELS[p] ?? p}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Create role
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
