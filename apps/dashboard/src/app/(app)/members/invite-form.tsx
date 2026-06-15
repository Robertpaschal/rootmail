"use client";

import { useActionState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { type InviteState, inviteMember, revokeInvite } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState | null, FormData>(inviteMember, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2">
        <Input name="email" type="email" placeholder="teammate@company.com" required />
        <Select name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Send invitation
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-600">{state.ok}</p> : null}
    </form>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  return (
    <form action={revokeInvite}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
        <X className="size-4" /> Revoke
      </Button>
    </form>
  );
}
