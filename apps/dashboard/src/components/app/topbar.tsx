import Link from "next/link";
import { Bell } from "lucide-react";
import { getClientContext } from "@/lib/client-context";
import { listAccounts, type AccountsView, type ActiveIdentity } from "@/lib/accounts";
import { api } from "@/lib/rootmail";
import type { Workspace, WorkspaceLimit } from "@/lib/types";
import { AccountSwitcher } from "./account-switcher";
import { ClientSwitcher } from "./client-switcher";
import { CommandTrigger } from "./command-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { QuickCreate } from "./quick-create";
import { BrandMark, SidebarToggle } from "./sidebar-shell";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";

export async function Topbar() {
  let workspaces: Workspace[] = [];
  let activeId: string | null = null;
  let limit: WorkspaceLimit | null = null;
  let identity: ActiveIdentity | null = null;
  try {
    const [me, ws] = await Promise.all([api.me(), api.listWorkspaces()]);
    activeId = me.active_workspace?.id ?? me.workspaces[0]?.id ?? null;
    workspaces = ws.data;
    limit = ws.workspaces_limit;
    identity = {
      email: me.user.email,
      name: me.user.name,
      avatarUrl: me.user.avatar_url,
      workspaceName: me.active_workspace?.name ?? null,
      impersonating: me.impersonating ?? false,
    };
  } catch {
    // Render a minimal bar; the layout guard handles real auth failures.
  }

  // The other identities signed in on this browser. Costs nothing extra for the
  // single-account case — it only calls the API when there is a second token.
  const accounts: AccountsView = await listAccounts(identity);

  // Agency mode: the workspace's client domains + the acting-as selection
  // (shared per-request lookup with the scope banner; never throws).
  const clientCtx = await getClientContext();

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b bg-card/80 px-4 py-2 backdrop-blur md:gap-4 md:px-8">
      <div className="md:hidden">
        <Link href="/" aria-label="rootmail">
          {/* The mark keeps the product identity without forcing the utility
              cluster off narrow screens; the wordmark returns at sm. */}
          <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
      </div>
      {/* The brand never leaves the screen: the sidebar carries it when docked,
          the top bar picks it up the moment it's hidden. */}
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <BrandMark />
        {/* Hiding the sidebar has to be findable without knowing ⌘\. */}
        <SidebarToggle className="-ml-1" />
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:gap-3">
        <QuickCreate />
        <CommandTrigger />
        {workspaces.length > 0 ? (
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeId} limit={limit} />
        ) : null}
        {clientCtx.tenants.length > 0 ? (
          <ClientSwitcher
            tenants={clientCtx.tenants}
            activeId={clientCtx.active?.id ?? null}
            stale={clientCtx.staleId !== null}
          />
        ) : null}
        {/* Interventions and drift are global signals, not a place users work
            inside every day. Keep the full record one click away with the
            account utilities, without charging it permanent sidebar rent. */}
        <Link
          href="/activity"
          aria-label="What changed"
          title="What changed"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
        >
          <Bell className="size-4" />
        </Link>
        <ThemeToggle />
        {/* Identity, its other identities, and sign-out all live behind the
            avatar. Sign out used to be a bare button here; once a browser can
            hold several accounts an unqualified "Sign out" no longer says what
            it will do, so it moved inside where it can name the account. */}
        <AccountSwitcher view={accounts} />
      </div>
    </header>
  );
}
