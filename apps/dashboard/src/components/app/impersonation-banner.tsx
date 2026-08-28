"use client";

import { useTransition } from "react";
import { AtSign, UserCog } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";

/**
 * Two different warnings that used to be one.
 *
 * Support impersonation and opening our own workspace share a handoff, so both
 * arrive with `impersonating: true` — and the banner then said "Impersonating
 * admin@rootmail.io for support", which is false twice over: nobody is being
 * impersonated, and it names the least important risk in the room. Being inside
 * OUR account means the audience is every customer we have. That is the fact
 * worth a banner, so it gets its own.
 */
export function ImpersonationBanner({ email, internal }: { email: string; internal?: boolean }) {
  const [pending, startTransition] = useTransition();

  const stop = (
    <Button
      size="sm"
      variant="outline"
      className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
      disabled={pending}
      onClick={() => startTransition(async () => void (await signOut()))}
    >
      {pending ? "Leaving…" : internal ? "Leave" : "Stop impersonating"}
    </Button>
  );

  if (internal) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-ink px-4 py-2 text-sm font-medium text-white">
        <div className="flex items-center gap-2">
          <AtSign className="size-4 shrink-0" />
          <span>
            You are in <strong>rootmail&apos;s own workspace</strong> as {email}. This audience is
            our customers — anything sent here goes to real people who pay us.
          </span>
        </div>
        {stop}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-stopped bg-stopped px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <UserCog className="size-4 shrink-0" />
        <span>
          Impersonating <strong>{email}</strong> for support — actions are performed as this user.
        </span>
      </div>
      {stop}
    </div>
  );
}
