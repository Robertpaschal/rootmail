import { redirect } from "next/navigation";
import { AssistantLauncher } from "@/components/app/assistant-launcher";
import { CommandMenu } from "@/components/app/command-menu";
import { ImpersonationBanner } from "@/components/app/impersonation-banner";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { Topbar } from "@/components/app/topbar";
import { VerifyEmailBanner } from "@/components/app/verify-email-banner";
import { api } from "@/lib/rootmail";
import { getSessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-braces alongside middleware: never render the shell without a session.
  const token = await getSessionToken();
  if (!token) redirect("/login");

  // One lookup powers the verify-email nudge and the impersonation banner (never
  // block the shell if it fails).
  let me = null;
  try {
    me = await api.me();
  } catch {
    /* ignore — don't wedge the app on a transient lookup failure */
  }
  // New orgs set up their business profile first — it grounds compliance (the
  // CAN-SPAM address) and personalizes the product. Existing orgs are backfilled
  // complete, so only fresh signups ever see the wizard.
  if (me && me.onboarding_completed === false) redirect("/onboarding");

  const unverified = me ? !me.user.email_verified : false;
  const impersonating = me?.impersonating ?? false;

  return (
    <div className="min-h-screen">
      <CommandMenu />
      <Sidebar />
      <div className="md:pl-72">
        <Topbar />
        <MobileNav />
        {impersonating && me ? <ImpersonationBanner email={me.user.email} /> : null}
        {unverified ? <VerifyEmailBanner /> : null}
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
      {/* The assistant, one tap away on every page (hides itself on /assistant). */}
      <AssistantLauncher />
    </div>
  );
}
