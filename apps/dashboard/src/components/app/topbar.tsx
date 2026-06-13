import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApiKey, keyMode, maskKey } from "@/lib/session";
import { Logo } from "./logo";

export async function Topbar() {
  const key = await getApiKey();
  const mode = key ? keyMode(key) : "unknown";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card/80 px-4 backdrop-blur md:px-8">
      <div className="md:hidden">
        <Link href="/" aria-label="rootmail">
          <Logo />
        </Link>
      </div>
      <div className="hidden md:block" />

      <div className="flex items-center gap-2 sm:gap-3">
        {key ? (
          <span className="hidden items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
            <KeyRound className="size-3.5" />
            <span className="font-mono">{maskKey(key)}</span>
          </span>
        ) : null}
        <Badge variant={mode === "live" ? "success" : mode === "test" ? "warning" : "muted"}>
          {mode === "live" ? "Live" : mode === "test" ? "Test" : "—"}
        </Badge>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="size-4" /> Disconnect
          </Button>
        </form>
      </div>
    </header>
  );
}
