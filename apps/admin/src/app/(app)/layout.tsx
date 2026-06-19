import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { adminApi, ConnectionError } from "@/lib/admin-api";
import { Logo } from "@/components/app/logo";
import { MobileNav, Nav } from "@/components/app/nav";
import { Topbar } from "@/components/app/topbar";
import type { StaffUser } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let staff: StaffUser;
  try {
    staff = (await adminApi.me()).staff;
  } catch (err) {
    // API unreachable → show a clear message instead of redirecting (a redirect
    // here would loop, since the login page can't reach the API either).
    if (err instanceof ConnectionError) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <h1 className="text-lg font-semibold">Can&apos;t reach the API</h1>
            <p className="text-sm text-muted-foreground">{err.message}</p>
          </div>
        </main>
      );
    }
    // Expired/invalid session → back to login (middleware won't bounce us back).
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="px-2 py-3">
          <Logo />
        </div>
        <div className="mt-4 flex-1">
          <Nav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar staff={staff} />
        <MobileNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
