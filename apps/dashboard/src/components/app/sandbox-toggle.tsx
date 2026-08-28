"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { switchWorkspace } from "./workspace-actions";
import { cn } from "@/lib/utils";

/**
 * The one deliberate door in and out of the sandbox.
 *
 * The sandbox used to sit in the workspace picker beside your real product,
 * which read as "here are your two products" to anyone who wasn't a developer.
 * It isn't a product — it's a rehearsal room. So it's entered on purpose, from
 * Developers → Testing, and every screen inside it offers the way back.
 */
export function SandboxToggle({
  sandboxId,
  liveId,
  liveName,
  inSandbox,
  variant = "default",
}: {
  /** The test workspace, if the org has one. */
  sandboxId: string | null;
  /** Where "leave" goes back to. */
  liveId: string | null;
  liveName: string | null;
  inSandbox: boolean;
  /** "banner" is the compact treatment for the sandbox strip. */
  variant?: "default" | "banner";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (id: string) =>
    start(async () => {
      const res = await switchWorkspace(id);
      if (res.error) return setError(res.error);
      setError(null);
      router.refresh();
    });

  if (inSandbox) {
    if (!liveId) return null;
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => go(liveId)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60",
          variant === "banner"
            ? "border border-acted/40 px-2.5 py-1 text-acted hover:bg-acted/20"
            : "border px-3 py-1.5 hover:bg-accent",
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowLeft className="size-3.5" />}
        Leave the sandbox{liveName && variant !== "banner" ? ` — back to ${liveName}` : ""}
      </button>
    );
  }

  if (!sandboxId) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => go(sandboxId)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
        Open the sandbox
      </button>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </div>
  );
}
