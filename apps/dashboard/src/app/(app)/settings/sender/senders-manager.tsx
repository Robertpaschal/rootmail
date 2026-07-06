"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, MailPlus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SenderIdentity } from "@/lib/types";
import { addSenderAction, checkSenderAction, deleteSenderAction, type SenderState } from "./actions";

// Your own from-addresses. Adding one makes Amazon (our email provider) send a
// confirmation link to that mailbox; once clicked, the address appears in
// compose's From menu — and replies go straight to the real inbox.
export function SendersManager({ senders }: { senders: SenderIdentity[] }) {
  const [state, action] = useActionState<SenderState, FormData>(addSenderAction, {});
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const check = (id: string) =>
    start(async () => {
      setRowError(null);
      const res = await checkSenderAction(id);
      if (res.error) setRowError(res.error);
      else if (res.status !== "verified") {
        setRowError("Not confirmed yet — click the link in the email we sent to that address, then check again.");
      }
    });

  const remove = (id: string, email: string) =>
    start(async () => {
      if (!confirm(`Remove ${email}? Sends using it as From will stop working.`)) return;
      setRowError(null);
      const res = await deleteSenderAction(id);
      if (res.error) setRowError(res.error);
    });

  return (
    <div className="space-y-4">
      {senders.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {senders.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {s.display_name ? `${s.display_name} · ${s.email}` : s.email}
                </p>
                {s.status === "pending" ? (
                  <p className="text-xs text-muted-foreground">
                    Confirmation email sent to this address — click the link inside, then check.
                  </p>
                ) : null}
              </div>
              <Badge variant={s.status === "verified" ? "success" : "warning"}>
                {s.status === "verified" ? "verified" : "pending"}
              </Badge>
              {s.status === "pending" ? (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => check(s.id)}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Check
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(s.id, s.email)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {rowError ? <p className="text-sm text-destructive">{rowError}</p> : null}

      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="snd-email">Email address</Label>
          <Input id="snd-email" name="email" type="email" placeholder="hello@yourcompany.com" className="w-64" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="snd-name">Display name</Label>
          <Input id="snd-name" name="display_name" placeholder="Acme (optional)" className="w-44" />
        </div>
        <AddButton />
      </form>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-sm text-emerald-600">
          Added — a confirmation email is on its way to that inbox.
        </p>
      ) : null}
    </div>
  );
}

function AddButton() {
  return (
    <Button type="submit" size="sm">
      <MailPlus className="size-4" /> Add address
    </Button>
  );
}
