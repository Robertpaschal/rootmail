"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, MailPlus, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SenderIdentity } from "@/lib/types";
import { addSenderAction, checkSenderAction, deleteSenderAction, setDefaultSenderAction, type SenderState } from "./actions";

// Your own from-addresses. Adding one makes Amazon (our email provider) send a
// confirmation link to that mailbox; once clicked, the address appears in
// compose's From menu — and replies go straight to the real inbox. The DEFAULT
// address is what campaigns and quick composes send from when none is named.
export function SendersManager({ senders }: { senders: SenderIdentity[] }) {
  const [state, action] = useActionState<SenderState, FormData>(addSenderAction, {});
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reduce = useReducedMotion();
  // The form NEVER opens itself — not even with zero addresses on file. An open
  // form is a demand; an empty state with a button is an invitation, and it
  // leaves room to say what the thing is for first.
  const [adding, setAdding] = useState(false);

  // A successful add puts the form away — the new row below is the confirmation.
  useEffect(() => {
    if (state.ok) setAdding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const verified = senders.filter((s) => s.status === "verified");
  const hasDefault = verified.some((s) => s.is_default);

  const check = (id: string) =>
    start(async () => {
      setRowError(null);
      const res = await checkSenderAction(id);
      if (res.error) setRowError(res.error);
      else if (res.status !== "verified") {
        setRowError("Not confirmed yet — click the link in the email we sent to that address, then check again.");
      }
    });

  const makeDefault = (id: string) =>
    start(async () => {
      setRowError(null);
      const res = await setDefaultSenderAction(id);
      if (res.error) setRowError(res.error);
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
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {s.display_name ? `${s.display_name} · ${s.email}` : s.email}
                  {s.is_default ? (
                    <Badge variant="secondary" className="gap-1"><Star className="size-3 fill-current" /> Default</Badge>
                  ) : null}
                </p>
                {s.status === "pending" ? (
                  <p className="text-xs text-muted-foreground">
                    Confirmation email sent to this address — click the link inside, then check.
                  </p>
                ) : s.is_default ? (
                  <p className="text-xs text-muted-foreground">Campaigns and composes send from this address unless you pick another.</p>
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
              ) : !s.is_default ? (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => makeDefault(s.id)}>
                  <Check className="size-3.5" /> Make default
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
      {verified.length > 0 && !hasDefault ? (
        <p className="text-xs text-muted-foreground">
          No default set — sends without a named From still go from rootmail&apos;s address. Pick one above to send as your own.
        </p>
      ) : null}
      {rowError ? <p className="text-sm text-destructive">{rowError}</p> : null}

      {senders.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">No sending address yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Add and verify an address to enable dashboard sending. Recipients see your name;
            replies follow the reply destination you choose below.
          </p>
          <Button type="button" size="sm" className="mt-4" onClick={() => setAdding(true)}>
            <MailPlus className="size-4" /> Add your first address
          </Button>
        </div>
      ) : null}

      {senders.length > 0 && !adding ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add another address
        </Button>
      ) : null}

      <AnimatePresence initial={false}>
        {adding ? (
          <motion.div
            key="add-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { height: { type: "spring", stiffness: 380, damping: 34 }, opacity: { duration: 0.16 } }}
            className="overflow-hidden"
          >
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
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="pb-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-sm text-witnessed">
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
