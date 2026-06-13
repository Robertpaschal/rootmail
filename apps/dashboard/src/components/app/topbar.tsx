import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { signOut } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/rootmail";
import { Logo } from "./logo";

export async function Topbar() {
  let email: string | null = null;
  let workspaceName: string | null = null;
  let mode: "live" | "test" | "unknown" = "unknown";
  try {
    const me = await api.me();
    email = me.user.email;
    const ws = me.active_workspace ?? me.workspaces[0] ?? null;
    workspaceName = ws?.name ?? null;
    mode = ws?.environment ?? "unknown";
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
        {workspaceName ? (
          <span className="hidden text-sm text-muted-foreground sm:inline">{workspaceName}</span>
        ) : null}
        <Badge variant={mode === "live" ? "success" : mode === "test" ? "warning" : "muted"}>
          {mode === "live" ? "Live" : mode === "test" ? "Test" : "—"}
        </Badge>
        {email ? (
          <span className="hidden items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
            <UserIcon className="size-3.5" />
            {email}
          </span>
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
