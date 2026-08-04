import { redirect } from "next/navigation";
import { AssistantLauncher } from "@/components/app/assistant-launcher";
import { ClientScopeBanner } from "@/components/app/client-scope-banner";
import { CommandMenu } from "@/components/app/command-menu";
import { ImpersonationBanner } from "@/components/app/impersonation-banner";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { SandboxBanner } from "@/components/app/sandbox-banner";
import { PeekBackdrop, ShellMain, SidebarProvider } from "@/components/app/sidebar-shell";
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
  // The nav adapts to the workspace the user is IN: its name titles the
  // workspace group (the "product", not an abstract "Workspace"), and sandbox
  // vs live decides which sections can actually function (deliverability and
  // client domains need real sending).
  const ws = me?.active_workspace ?? me?.workspaces?.[0] ?? null;
  const navCtx = { workspaceName: ws?.name ?? null, sandbox: ws?.environment === "test" };
  // The sandbox always offers the way back to a real workspace.
  const live = me?.workspaces?.find((w) => w.environment === "live") ?? null;

  return (
    <SidebarProvider>
      <div className="min-h-screen">
        <CommandMenu />
        {/* The scrim sits under the panel and over the page it floats above. */}
        <PeekBackdrop />
        <Sidebar {...navCtx} />
        <ShellMain>
          <Topbar />
          <MobileNav {...navCtx} />
          {navCtx.sandbox ? (
            <SandboxBanner
              workspaceName={navCtx.workspaceName}
              liveId={live?.id ?? null}
              liveName={live?.name ?? null}
            />
          ) : null}
          {impersonating && me ? (
            <ImpersonationBanner email={me.user.email} internal={me.internal} />
          ) : null}
          {unverified ? <VerifyEmailBanner /> : null}
          {/* Agency mode: while acting as a client, name them on every page. */}
        <ClientScopeBanner />
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
        </ShellMain>
      </div>
      {/* The assistant, one tap away on every page (hides itself on /assistant). */}
      <AssistantLauncher />
    </SidebarProvider>
  );
}
