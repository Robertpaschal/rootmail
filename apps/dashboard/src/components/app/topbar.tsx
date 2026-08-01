import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { getClientContext } from "@/lib/client-context";
import { api } from "@/lib/rootmail";
import type { Workspace, WorkspaceLimit } from "@/lib/types";
import { ClientSwitcher } from "./client-switcher";
import { CommandTrigger } from "./command-menu";
import { Logo } from "./logo";
import { QuickCreate } from "./quick-create";
import { BrandMark, SidebarToggle } from "./sidebar-shell";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";

// First + last initial of the name, or the email — the avatar fallback.
function initials(name: string, email: string): string {
  const base = name.trim() || email;
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? base[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export async function Topbar() {
  let email: string | null = null;
  let name = "";
  let avatarUrl: string | null = null;
  let workspaces: Workspace[] = [];
  let activeId: string | null = null;
  let limit: WorkspaceLimit | null = null;
  try {
    const [me, ws] = await Promise.all([api.me(), api.listWorkspaces()]);
    email = me.user.email;
    name = me.user.name ?? "";
    avatarUrl = me.user.avatar_url;
    activeId = me.active_workspace?.id ?? me.workspaces[0]?.id ?? null;
    workspaces = ws.data;
    limit = ws.workspaces_limit;
  } catch {
    // Render a minimal bar; the layout guard handles real auth failures.
  }

  // Agency mode: the workspace's client domains + the acting-as selection
  // (shared per-request lookup with the scope banner; never throws).
  const clientCtx = await getClientContext();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card/80 px-4 backdrop-blur md:px-8">
      <div className="md:hidden">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>
      {/* The brand never leaves the screen: the sidebar carries it when docked,
          the top bar picks it up the moment it's hidden. */}
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark />
        {/* Hiding the sidebar has to be findable without knowing ⌘\. */}
        <SidebarToggle className="-ml-1" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
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
        <ThemeToggle />
        {email ? (
          <Link
            href="/settings/profile"
            title="Account & settings"
            className="hidden items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-semibold text-foreground">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initials(name, email)
              )}
            </span>
            <span className="max-w-[12rem] truncate">{name || email}</span>
          </Link>
        ) : null}
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
