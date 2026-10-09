"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyOutcomeCopy } from "@/lib/verify-email-copy";
import { confirmEmail, type VerifyState } from "./actions";

export function VerifyForm({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(confirmEmail, {});

  if (state.status) {
    const copy = verifyOutcomeCopy(state.status, signedIn);
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-center gap-2 font-medium">
          {state.status === "verified" ? (
            <CheckCircle2 className="size-5 text-witnessed" aria-hidden />
          ) : (
            <XCircle className="size-5 text-destructive" aria-hidden />
          )}
          {copy.title}
        </p>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <Link href={copy.href} className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline">
          {copy.cta}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Confirm my email
      </Button>
    </form>
  );
}
