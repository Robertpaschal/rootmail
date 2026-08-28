"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, LifeBuoy, Loader2, LogIn, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What a page shows when it couldn't load.
 *
 * This used to say "Can't reach the rootmail API" and offer "Reconnect with a
 * different key" — both left over from when the dashboard authenticated with an
 * API key you pasted in. Two things wrong with that now:
 *
 *  • Nobody signs in with a key any more; they have a session. Being told to
 *    reconnect with a key is advice for a product they aren't using.
 *  • `/connect` doesn't exist. The button was a dead link on all ~28 pages that
 *    render this.
 *
 * And "the rootmail API" is our word, not theirs — from the outside this is just
 * rootmail not loading.
 *
 * So: say what happened in plain terms, and offer the thing that actually helps.
 * A retry for a blip, a sign-in for an expired session, support when it persists.
 */

export function ConnectionError({
  title,
  message,
  /** HTTP status, when the server answered at all. Drives which help we offer. */
  status,
  /**
   * @deprecated Held only so older call sites keep compiling. It used to reveal
   * the key-reconnect link; it now does nothing. Pass `status` instead.
   */
  showReconnect,
}: {
  title?: string;
  message: string;
  status?: number;
  showReconnect?: boolean;
}) {
  const router = useRouter();
  const [retrying, retry] = useTransition();
  void showReconnect;

  // 401/403 is a session problem — retrying will just fail again, so the useful
  // door is the sign-in page. Everything else is worth one more try.
  const authExpired = status === 401 || status === 403;

  return (
    <Card className="flex flex-col items-center gap-3 p-12 text-center">
      <div className="grid size-12 place-items-center rounded-lg bg-acted/15 text-acted">
        <AlertTriangle className="size-6" />
      </div>

      <h3 className="text-base font-semibold">
        {title ?? (authExpired ? "You've been signed out" : "This didn't load")}
      </h3>

      <p className="max-w-md text-sm text-muted-foreground">
        {authExpired
          ? "Your session has expired, which happens after a while away. Sign in again and you'll come straight back here."
          : message}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {authExpired ? (
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            <LogIn className="size-4" /> Sign in again
          </Link>
        ) : (
          <Button size="sm" onClick={() => retry(() => router.refresh())} disabled={retrying}>
            {retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {retrying ? "Trying…" : "Try again"}
          </Button>
        )}
        <Link href="/contact" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <LifeBuoy className="size-4" /> Get help
        </Link>
      </div>

      {!authExpired ? (
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Nothing you&apos;ve set up is affected — this is only about loading the page. If it keeps
          happening, tell us and we&apos;ll look into it.
        </p>
      ) : null}
    </Card>
  );
}
