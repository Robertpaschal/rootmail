import { redirect } from "next/navigation";
import { AssistantLauncher } from "@/components/app/assistant-launcher";
import { ClientScopeBanner } from "@/components/app/client-scope-banner";
import { CommandMenu } from "@/components/app/command-menu";
import { ImpersonationBanner } from "@/components/app/impersonation-banner";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { BetaBanner } from "@/components/app/beta-banner";
import { SandboxBanner } from "@/components/app/sandbox-banner";
import { PeekBackdrop, ShellMain, SidebarProvider } from "@/components/app/sidebar-shell";
import { Topbar } from "@/components/app/topbar";
import { VerifyEmailBanner } from "@/components/app/verify-email-banner";
import { ApiError, api } from "@/lib/rootmail";
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
  } catch (err) {
    /*
     * Tolerant of a blip, not of a rejection.
     *
     * This used to swallow everything, which conflated two very different
     * things: a transient 500 (keep going, the shell is still useful) and a
     * 401 (this session is not valid, and nothing on the page will work). The
     * second rendered a signed-out shell full of broken panels — which is what
     * you get after an account is deleted while its cookie is still in the
     * browser, and it reads as "the product is broken" rather than "you are
     * logged out".
     */
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Redirect only — a Server Component may not write cookies during
      // render, and calling clearSessionCookie() here threw, turning a clean
      // logout into a 500. /logout is a route handler, which is allowed to.
      redirect("/logout?reason=expired");
    }
    /* anything else: keep the shell, it may still be useful */
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
            <ImpersonationBanner
              // Inside our own workspace the address is a synthetic staff
              // identity (…@staff.rootmail.invalid) that means nothing to a
              // reader — name the person instead.
              email={me.internal ? (me.user.name ?? me.user.email) : me.user.email}
              internal={me.internal}
            />
          ) : null}
          {me?.beta ? <BetaBanner /> : null}
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
