import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { api } from "@/lib/rootmail";
import { getSessionToken } from "@/lib/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Welcome to rootmail" };
export const dynamic = "force-dynamic";

// The post-signup wizard: gather the little we structurally need (identity +
// compliance address + what they do + how they send today), explaining why at
// each step — then size the account (send volume + contacts + team) and hand off
// to the per-wing pricing with those answers pre-filled.
export default async function OnboardingPage() {
  const token = await getSessionToken();
  if (!token) redirect("/login");

  let orgName = "";
  let userName = "";
  let alreadyDone = false;
  let failed = false;
  try {
    const [me, org] = await Promise.all([api.me(), api.getOrganization()]);
    alreadyDone = me.onboarding_completed !== false;
    orgName = org.name;
    userName = me.user.name ?? "";
  } catch {
    failed = true;
  }
  // Redirects live OUTSIDE the try — redirect() throws, and a catch would eat it.
  // A transient failure falls back to the app rather than wedging a new user here.
  if (failed || alreadyDone) redirect("/");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <OnboardingWizard orgName={orgName} userName={userName} />
      </main>
    </div>
  );
}
