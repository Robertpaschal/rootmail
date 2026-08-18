"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PlayCircle } from "lucide-react";
import { resumeSubTenant } from "../actions";
import { Button } from "@/components/ui/button";
import { REPUTATION_WINDOW_DAYS } from "@/lib/reputation";

/**
 * The ladder out of the trap door.
 *
 * Two things this control has to get right, both of them about what the operator
 * believes afterwards:
 *
 * 1. **It must not feel like a dismiss.** One click that makes a red panel go
 *    away is indistinguishable from closing a notification, and an operator who
 *    thinks they acknowledged something has not decided anything. So the button
 *    opens a statement of consequences and asks again.
 *
 * 2. **It must say what resuming actually does** — including the part that is
 *    genuinely reassuring (the old bounces stop counting) and the part that is
 *    not (nothing about the list has been fixed by pressing this).
 *
 * The success path calls `router.refresh()` rather than having the action
 * revalidate this route: revalidating the page you are already on resets the
 * client state on it, which here would tear this component down mid-transition.
 *
 * No `AnimatePresence` around the swap, deliberately. `mode="wait"` will not
 * mount the entering child until the leaving one finishes its exit — so anywhere
 * requestAnimationFrame is throttled or frozen, pressing the button does
 * nothing at all and the operator concludes the control is broken. An animation
 * must never be the thing that makes content appear. The entrance here is a CSS
 * keyframe, which either plays or doesn't, and the panel is in the DOM either way.
 */
export function ResumeClient({ id, name, domain }: { id: string; name: string; domain: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const resume = () =>
    start(async () => {
      setError(null);
      const res = await resumeSubTenant(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      // Re-render the server tree for this route with the new state, without
      // resetting it (see the note above).
      router.refresh();
    });

  return (
    <div>
      {!confirming ? (
        <Button type="button" size="sm" onClick={() => setConfirming(true)}>
          <PlayCircle className="size-4" /> Resume sending
        </Button>
      ) : (
        <div className="animate-in fade-in-0 slide-in-from-top-1 rounded-lg border border-amber-300 bg-amber-50 p-4 duration-200 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-sm font-medium">Resume sending for {name}?</p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{domain} can send again immediately.</span>{" "}
              Anything your app queued for them while they were paused was rejected at the time
              and is not waiting — they will need to be sent again.
            </li>
            <li>
              <span className="font-medium text-foreground">
                We start their {REPUTATION_WINDOW_DAYS}-day window over.
              </span>{" "}
              The bounces and complaints that caused this pause will not count against them
              twice — they are judged on what they send from now on.
            </li>
            <li>
              <span className="font-medium text-foreground">Nothing has been fixed by this.</span>{" "}
              If the list or the sign-up flow that produced those numbers is unchanged, they
              will cross the line again and be paused again, usually within a sweep or two.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={resume} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              Yes, resume {domain}
            </Button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={pending}
            >
              Keep them paused
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1 text-xs text-destructive animate-in fade-in-0"
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
