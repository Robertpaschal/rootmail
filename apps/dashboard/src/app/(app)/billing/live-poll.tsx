"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the billing surfaces live without a manual refresh: re-fetches (router
 * .refresh) when the tab regains focus/visibility and on a slow interval while
 * visible. So a checkout that completes (or is abandoned) reflects real state on
 * its own — no more "I cancelled but it still shows the upgrade."
 */
export function BillingLivePoll({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - last.current < 4000) return; // debounce bursts
      last.current = now;
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [router, intervalMs]);

  return null;
}
