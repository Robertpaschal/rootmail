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
/**
 * What renders while the live status is in flight.
 *
 * Deliberately the true, useful sentence rather than a shimmer: a visitor who
 * only ever sees this still learns the door is locked and where to knock. A
 * skeleton would teach them nothing, and a guessed seat count could be wrong.
 */
export function BetaNoticeFallback() {
  return (
    <NoticeShell badge="Closed beta" cta="Ask for an invite">
      <span className="text-muted-foreground">rootmail is invite-only while we finish it.</span>
    </NoticeShell>
  );
}

function NoticeShell({
  badge,
  cta,
  children,
}: {
  badge: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* The nav sticks below this strip rather than under it. Declaring the
          height here means an open beta — where nothing renders — leaves the
          nav flush at the top, with no constant to remember to remove. */}
      <style>{":root{--beta-notice-h:37px}"}</style>
    <div className="sticky top-0 z-[60] border-b border-primary/25 bg-primary/10 backdrop-blur supports-[backdrop-filter]:bg-primary/10">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm">
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
          {badge}
        </span>
        {children}
        <Link
          href="/beta"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {cta}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
    </>
  );
}

export async function BetaNotice() {
  const beta = await betaStatus();
  if (!beta.closed) return null;

  const full = !beta.accepting;

  return (
    <NoticeShell
      badge={full ? "Beta full" : "Closed beta"}
      cta={full ? "Get on the list" : "Ask for an invite"}
    >
      {full ? (
        <span className="text-muted-foreground">
          This round is full — new accounts are paused. Join the list and
          you&apos;ll hear the moment the next one opens.
        </span>
      ) : (
        <span className="text-muted-foreground">
          rootmail is invite-only while we finish it.{" "}
          {beta.seatsTotal > 0 ? (
            <span className="text-foreground">
              {beta.seatsLeft} {beta.seatsLeft === 1 ? "place" : "places"} left in this round.
            </span>
          ) : null}
        </span>
      )}
    </NoticeShell>
  );
}
