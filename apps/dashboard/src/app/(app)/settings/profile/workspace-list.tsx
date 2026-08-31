"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { switchWorkspace } from "@/components/app/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Every workspace this account can open — not just the active one.
 *
 * Profile used to print a single "WORKSPACE" value, which is wrong twice: it
 * implies you have exactly one, and it doesn't say what a workspace IS or that
 * the rest of the dashboard is scoped to whichever one you're in. People with a
 * Production and a Sandbox (everyone, by default) had no way to see that from
 * here.
 */
export function WorkspaceList({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string | null;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const open = (id: string) => {
    setError(null);
    setPendingId(id);
    start(async () => {
      const res = await switchWorkspace(id);
      if (res?.error) {
        setError(res.error);
        setPendingId(null);
      }
    });
  };

  if (workspaces.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">No workspaces on this account.</p>;
  }

  return (
    <div>
      {error ? <p className="px-4 pt-3 text-sm text-destructive">{error}</p> : null}
      <ul className="divide-y">
        {workspaces.map((w) => {
          const active = w.id === activeId;
          return (
            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>
                    {w.name}
                  </span>
                  <Badge variant={w.environment === "live" ? "success" : "secondary"}>
                    {w.environment === "live" ? "Live" : "Sandbox"}
                  </Badge>
                  {active ? (
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary">
                      <Check className="size-3" /> You&apos;re here
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {w.environment === "live"
                    ? "Real sends, real contacts, real billing."
                    : "A safe copy for trying things — sends here never reach anyone or cost anything."}
                </span>
              </span>
              {!active ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingId !== null}
                  onClick={() => open(w.id)}
                >
                  {pendingId === w.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Open
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
