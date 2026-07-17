"use client";

import { useActionState, useEffect } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { type InviteState, inviteMember, revokeInvite } from "./actions";
import { useRevealClose } from "@/components/app/reveal-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function InviteForm({ customRoles = [] }: { customRoles?: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<InviteState | null, FormData>(inviteMember, null);
  const closeReveal = useRevealClose();

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.ok);
      closeReveal();
    } else if (state?.error) toast.error(state.error);
  }, [state, closeReveal]);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2">
        <Input name="email" type="email" placeholder="teammate@company.com" required />
        <Select name="role" defaultValue="member">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          {customRoles.length > 0 ? (
            <optgroup label="Custom roles">
              {customRoles.map((r) => (
                <option key={r.id} value={`custom:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Send invitation
      </Button>
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
