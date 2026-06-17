"use client";

import { useTransition } from "react";
import { UserCog } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-rose-700 bg-rose-600 px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <UserCog className="size-4 shrink-0" />
        <span>
          Impersonating <strong>{email}</strong> for support — actions are performed as this user.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        disabled={pending}
        onClick={() => startTransition(async () => void (await signOut()))}
      >
        {pending ? "Stopping…" : "Stop impersonating"}
      </Button>
    </div>
  );
}
