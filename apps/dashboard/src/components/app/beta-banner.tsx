import Link from "next/link";
import { MessageSquareHeart } from "lucide-react";

/**
 * The "you are testing an unfinished product" strip.
 *
 * A beta tester who forgets they are testing files no bugs — they just quietly
 * decide the product is mediocre and stop opening it. So this stays visible on
 * every page rather than appearing once at signup, and it asks for the thing we
 * actually need instead of merely announcing a status.
 *
 * It also names the send cap here rather than letting someone discover it as a
 * refusal. A tester who hits an unexplained limit concludes the product is
 * small; one who was told upfront that the limit is our provider's launch
 * restriction — and that their usage is what lifts it — reads the same wall as
 * progress they are part of.
 *
 * The feedback route is the SAME support inbox a paying customer uses, not a
 * form that drops into a spreadsheet nobody reads. A tester who writes to us
 * gets a reply from a person, which is the only thing that keeps them writing.
 */
export function BetaBanner() {
  return (
    <div className="border-b border-rule bg-secondary">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-8">
        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
          Beta
        </span>
        <span className="text-foreground">
          You&apos;re not testing a finished product — you&apos;re here to help finish it.
        </span>
        <span className="text-muted-foreground">
          Everything is unlocked. Daily send limits are ours, not the
          product&apos;s — and your using this is how they come off.
        </span>
        {/* Support lives in a pane on the assistant surface, not its own route —
            so this points where the pane actually is rather than inventing a
            URL. If that pane ever grows a deep link, this is the caller to fix. */}
        <Link
          href="/assistant"
          className="ml-auto inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
        >
          <MessageSquareHeart className="size-4" />
          Tell us what&apos;s broken
        </Link>
      </div>
    </div>
  );
}
