"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * An email body, as tall as the email actually is.
 *
 * Every surface that showed a rendered email picked a number and lived with it
 * — 380px on a message, 420px in Replies, 480px importing a template, 560px in
 * the preview. A number is wrong in both directions. A short email (a receipt,
 * a password reset, a one-line reply) got its three lines followed by a great
 * expanse of white that looked like the page had failed to load the rest. A
 * long one got trapped in a window and had to be scrolled through a letterbox.
 *
 * So: measure the content, be that tall, and only scroll once there is more
 * than `maxHeight` worth — at which point the scrolling belongs to the email
 * itself, not to a box that arbitrarily cut it off.
 *
 * WHY THE SANDBOX CHANGED — read before touching it.
 *
 * These frames were `sandbox=""`, which gives the document an opaque origin.
 * That is precisely what made them un-measurable: an opaque origin means the
 * parent cannot reach `contentDocument`, so nobody could ask the email how tall
 * it was, so everybody hard-coded a guess.
 *
 * `allow-same-origin` lifts that one restriction and nothing else. Scripts are
 * still not permitted, so the email cannot act on the privilege it has been
 * given: no JS runs, forms cannot submit, nothing can navigate the top frame,
 * nothing can open a window. The content stays as inert as it was.
 *
 * NEVER add `allow-scripts` alongside it. `allow-same-origin allow-scripts` is
 * the one genuinely dangerous pair: script running at the parent's origin can
 * reach out and strip the sandbox attribute off its own frame, and from there
 * it is simply running in your page. If a future feature needs scripting in a
 * preview, it needs a separate origin, not another token here.
 */

/** Below this, a frame reads as broken rather than short. */
const MIN_HEIGHT = 72;

export function EmailBodyFrame({
  html,
  title = "Email body",
  maxHeight = 560,
  className,
}: {
  html: string;
  title?: string;
  /** Past this the email scrolls inside itself. */
  maxHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  // null = not measured yet. Starting small and growing beats starting tall and
  // collapsing: the first is a box filling in, the second is a visible drop.
  const [height, setHeight] = useState<number | null>(null);

  // Set while we are deliberately resizing the frame, so the ResizeObserver
  // below ignores the change we caused and doesn't chase its own tail.
  const measuring = useRef(false);

  const measure = useCallback(() => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    const root = doc?.documentElement;
    if (!frame || !root) return; // cross-origin or not ready — keep the fallback

    // `documentElement.scrollHeight` is floored at the frame's OWN height: it
    // reports the larger of the content and the viewport it is being shown in.
    // So a frame can grow to fit its content but can never shrink back — it
    // just reports whatever it currently is and calls that the answer. The
    // first version of this measured a two-line email at 144px, exactly the
    // starting height, with the text ending at 63px. Same dead space as the
    // hard-coded frames, arrived at more expensively.
    //
    // Collapsing to 0 first drops that floor so the number that comes back is
    // the content alone. Width is untouched, so nothing re-wraps, and the
    // height is restored in the same synchronous block — the browser never
    // paints the collapsed state.
    measuring.current = true;
    const prev = frame.style.height;
    frame.style.height = "0px";
    const measured = Math.max(root.scrollHeight, doc.body?.scrollHeight ?? 0);
    frame.style.height = prev;
    measuring.current = false;

    if (measured > 0) setHeight(Math.min(Math.max(measured, MIN_HEIGHT), maxHeight));
  }, [maxHeight]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;

    let ro: ResizeObserver | undefined;
    const attach = () => {
      measure();
      // Images and web fonts land after the load event and change the height
      // when they do. Without this an email whose hero image arrives late keeps
      // whatever height it had while the image was still a 0px box.
      const root = frame.contentDocument?.documentElement;
      if (root && typeof ResizeObserver !== "undefined") {
        ro?.disconnect();
        // Skip the notification our own collapse-to-measure provokes, or the
        // observer re-measures because we measured, forever.
        ro = new ResizeObserver(() => {
          if (!measuring.current) measure();
        });
        ro.observe(root);
      }
    };

    attach(); // already-parsed srcDoc never fires `load` again
    frame.addEventListener("load", attach);
    return () => {
      frame.removeEventListener("load", attach);
      ro?.disconnect();
    };
  }, [html, measure]);

  return (
    <iframe
      ref={ref}
      title={title}
      // See the note above. allow-same-origin ONLY — never with allow-scripts.
      sandbox="allow-same-origin"
      srcDoc={html}
      onLoad={measure}
      style={{ height: height ?? MIN_HEIGHT * 2 }}
      className={cn("w-full border-0 bg-white", className)}
    />
  );
}
