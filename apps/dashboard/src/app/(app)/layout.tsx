import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { Topbar } from "@/components/app/topbar";
import { VerifyEmailBanner } from "@/components/app/verify-email-banner";
import { api } from "@/lib/rootmail";
import { getSessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-braces alongside middleware: never render the shell without a session.
  const token = await getSessionToken();
  if (!token) redirect("/login");

  // Surface a verify-email nudge until the account is confirmed (never block the
  // shell if the lookup fails).
  let unverified = false;
  try {
    unverified = !(await api.me()).user.email_verified;
  } catch {
    /* ignore — don't wedge the app on a transient lookup failure */
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-60">
        <Topbar />
        <MobileNav />
        {unverified ? <VerifyEmailBanner /> : null}
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
