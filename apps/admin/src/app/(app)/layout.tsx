import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { adminApi, ConnectionError } from "@/lib/admin-api";
import { Logo } from "@/components/app/logo";
import { MobileNav, Nav } from "@/components/app/nav";
import { Topbar } from "@/components/app/topbar";
import type { StaffUser } from "@/lib/types";

/**
 * Every page behind this layout is per-request by definition: it is gated on a
 * staff session and renders one org's live data.
 *
 * Declaring that explicitly rather than letting Next infer it. The inference is
 * environment-sensitive — `/content/changelog/new` is a synchronous component
 * with no fetch, so on a machine where the layout's `adminApi.me()` short-
 * circuits it became statically prerenderable, and prerendering a page whose
 * only child is a client component tripped a React Server Components manifest
 * bug: "Could not find the module …#ChangelogEditor in the React Client
 * Manifest". It built clean locally and failed in the Docker image build, which
 * is the worst place to discover it — CI blocks the deploy, and the cached
 * `.next` on a dev machine hides it.
 *
 * A staff console has no statically prerenderable pages. Saying so removes the
 * whole class of failure rather than the one route that hit it.
 */
export const dynamic = "force-dynamic";

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
    <div className="min-h-screen">
      {/* Fixed, full-height sidebar — stays put while the page scrolls; the nav
          scrolls internally if it ever overflows. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Nav />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-col md:pl-60">
        <Topbar staff={staff} />
        <MobileNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
