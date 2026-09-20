import Link from "next/link";
import { getClientContext } from "@/lib/client-context";
import { listAccounts, type AccountsView, type ActiveIdentity } from "@/lib/accounts";
import { api } from "@/lib/rootmail";
import type { Workspace, WorkspaceLimit } from "@/lib/types";
import { AccountSwitcher } from "./account-switcher";
import { ClientSwitcher } from "./client-switcher";
import { CommandTrigger } from "./command-menu";
import { loadNotifications } from "@/lib/notifications";
import { NotificationCenter } from "./notification-center";
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
  const notifications = await loadNotifications().catch(() => null);

  return (
    <header className="dashboard-topbar sticky top-0 z-[45] bg-background px-3 py-3 sm:px-5 lg:px-6">
      <div className="topbar-island">
      <div className="topbar-brand">
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
        <SidebarToggle />
      </div>
      </div>

      <div className="topbar-actions">
        <QuickCreate />
        <CommandTrigger />
        <div className="topbar-context">
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
        </div>
      </div>
      <div className="topbar-utilities">
        <NotificationCenter key={notifications?.scope ?? "unavailable"} initial={notifications} />
        <ThemeToggle />
        {/* Identity, its other identities, and sign-out all live behind the
            avatar. Sign out used to be a bare button here; once a browser can
            hold several accounts an unqualified "Sign out" no longer says what
            it will do, so it moved inside where it can name the account. */}
        <AccountSwitcher view={accounts} />
      </div>
      </div>
    </header>
  );
}
