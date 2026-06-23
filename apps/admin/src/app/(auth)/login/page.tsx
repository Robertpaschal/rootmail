import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { getStaffToken } from "@/lib/session";
import { BootstrapForm } from "../bootstrap/bootstrap-form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Soft auto-skip: a still-valid session goes straight in. An expired session
  // (or unreachable API) just falls through to the form — no redirect loop.
  const token = await getStaffToken();
  if (token) {
    const ok = await adminApi
      .me()
      .then(() => true)
      .catch(() => false);
    if (ok) redirect("/");
  }

  // Before any staff exists, the login page IS the first-run setup: create the
  // first superadmin right here (gated by the bootstrap secret). Once one exists,
  // it's the normal sign-in.
  const needsBootstrap = await adminApi
    .status()
    .then((s) => s.needs_bootstrap)
    .catch(() => false);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{needsBootstrap ? "Create the first superadmin" : "Staff sign in"}</CardTitle>
            <CardDescription>
              {needsBootstrap
                ? "No staff exist yet. Set up the first account using your deployment's bootstrap secret."
                : "Internal access only. Activity is audited."}
            </CardDescription>
          </CardHeader>
          <CardContent>{needsBootstrap ? <BootstrapForm /> : <LoginForm />}</CardContent>
        </Card>
      </div>
    </main>
  );
}
