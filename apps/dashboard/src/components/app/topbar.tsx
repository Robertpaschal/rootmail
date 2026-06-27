import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/rootmail";
import { CommandTrigger } from "./command-menu";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function Topbar() {
  let email: string | null = null;
  let workspaceName: string | null = null;
  try {
    const me = await api.me();
    email = me.user.email;
    const ws = me.active_workspace ?? me.workspaces[0] ?? null;
    workspaceName = ws?.name ?? null;
  } catch {
    // Render a minimal bar; the layout guard handles real auth failures.
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card/80 px-4 backdrop-blur md:px-8">
      <div className="md:hidden">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-2 sm:gap-3">
        <CommandTrigger />
        {workspaceName ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">{workspaceName}</span>
        ) : null}
        <ThemeToggle />
        {email ? (
          <Link
            href="/settings"
            title="Account & settings"
            className="hidden items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <UserIcon className="size-3.5" />
            {email}
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
