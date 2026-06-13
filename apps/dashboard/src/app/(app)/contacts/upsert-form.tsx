"use client";

import { useActionState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { upsertContact, type UpsertState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UpsertContactForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, pending] = useActionState<UpsertState | null, FormData>(
    upsertContact,
    null,
  );

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Add or update</CardTitle>
        <CardDescription>Upsert a contact by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              name="email"
              type="email"
              placeholder="ada@example.com"
              defaultValue={defaultEmail}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" name="name" placeholder="Ada Lovelace" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" name="phone" placeholder="+1 555 0100" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-tags">Tags</Label>
            <Input id="c-tags" name="tags" placeholder="vip, beta" className="font-mono" />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {pending ? "Saving…" : "Save contact"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
