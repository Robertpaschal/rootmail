"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { type AddressState, saveSenderAddress } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SenderAddressForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<AddressState | null, FormData>(saveSenderAddress, null);

  useEffect(() => {
    if (state?.ok) toast.success("Sender address saved.");
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="postal_address">Postal address</Label>
        <Textarea
          id="postal_address"
          name="postal_address"
          rows={3}
          defaultValue={initial}
          placeholder={"Acme Inc.\n123 Main St, Suite 100\nSan Francisco, CA 94105"}
        />
        <p className="text-xs text-muted-foreground">Leave blank to remove it from footers.</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save
      </Button>
    </form>
  );
}
