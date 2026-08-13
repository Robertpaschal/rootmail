import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { betaStatus } from "@/lib/beta";

/**
 * The strip that stops a stranger wasting their time.
 *
 * Without it the site offers a Sign up button that cannot work: the door needs
 * an invite code, and the visitor only finds out after filling in a form. That
 * is the kind of small dishonesty people remember, and it costs us the exact
 * person who was interested enough to try.
 *
 * It says three different things, because the visitor's options genuinely
 * differ:
 *
 *   seats left  — you can probably get in now; ask for an invite
 *   full        — the round is closed; join the queue for the next one
 *   open        — nothing to see, render nothing
 *
 * "Full" is the one that matters most. Telling someone the round is closed
 * respects them enough to stop them trying; leaving it ambiguous means they
 * apply, hear nothing, and conclude we ignored them.
 */
export async function BetaNotice() {
  const beta = await betaStatus();
  if (!beta.closed) return null;

  const full = !beta.accepting;

  return (
    <div className="border-b border-primary/25 bg-primary/10">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm">
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
          {full ? "Beta full" : "Closed beta"}
        </span>
        {full ? (
          <span className="text-muted-foreground">
            This round is full — new accounts are paused. Join the list and
            you&apos;ll hear the moment the next one opens.
          </span>
        ) : (
          <span className="text-muted-foreground">
            rootmail is invite-only while we finish it.{" "}
            <span className="text-foreground">
              {beta.seatsLeft} {beta.seatsLeft === 1 ? "place" : "places"} left in this round.
            </span>
          </span>
        )}
        <Link
          href="/beta"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {full ? "Get on the list" : "Ask for an invite"}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
