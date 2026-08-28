import Link from "next/link";
import { AlertTriangle, ArrowRight, Network, X } from "lucide-react";
import { ActionForm } from "./action-form";
import { exitClientScopeForm } from "./client-scope-actions";
import { SubTenantStatusBadge } from "./status-badge";
import { getClientContext } from "@/lib/client-context";

/**
 * The "you're somewhere else" chrome for agency mode. While the operator is
 * acting as a client, this strip sits above every page and says exactly whose
 * data they're looking at — with one-tap outs to the client's domain page or
 * back to the whole workspace. (The topbar switcher pill stays tinted too, so
 * the state survives scrolling.) Self-contained: reads the shared per-request
 * client context and renders nothing when no client is selected.
 */
export async function ClientScopeBanner() {
  const { active, staleId } = await getClientContext();

  // The selection points at a client that's gone. Every scoped page is 404ing
  // right now, so this strip is the only way back — say so plainly.
  if (staleId) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-acted/40 bg-acted/[0.08] px-4 py-2 text-sm md:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-acted/20 text-acted">
            <AlertTriangle className="size-3.5" />
          </span>
          <p className="min-w-0 truncate">
            <strong className="font-semibold">This client view no longer exists.</strong>{" "}
            <span className="text-muted-foreground">
              The client domain was removed, so pages will keep failing to load until you leave it.
            </span>
          </p>
        </div>
        <ActionForm action={exitClientScopeForm} className="shrink-0" errorClassName="justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md border border-acted/50 bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <X className="size-3" /> Back to the whole workspace
          </button>
        </ActionForm>
      </div>
    );
  }

  if (!active) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/25 bg-primary/[0.07] px-4 py-2 text-sm md:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Network className="size-3.5" />
        </span>
        <p className="min-w-0 truncate">
          Viewing client <strong className="font-semibold">{active.name}</strong>{" "}
          <span className="font-mono text-xs text-muted-foreground">{active.sending_domain}</span>
          <span className="hidden text-muted-foreground sm:inline">
            {" "}
            — email, audience &amp; insights are scoped to them.
          </span>
        </p>
        {active.status !== "verified" ? <SubTenantStatusBadge status={active.status} /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={`/sub-tenants/${active.id}`}
          className="hidden items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary sm:inline-flex"
        >
          Client page <ArrowRight className="size-3" />
        </Link>
        {/* If the exit ever fails, the operator has to KNOW — otherwise they'd
            carry on believing they're back in the workspace while every page is
            still a client's. Hence ActionForm rather than a bare form action. */}
        <ActionForm action={exitClientScopeForm} errorClassName="justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <X className="size-3" /> Exit client view
          </button>
        </ActionForm>
      </div>
    </div>
  );
}
