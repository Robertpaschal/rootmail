import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ssoDiscover } from "@/lib/rootmail";

export const dynamic = "force-dynamic";

// "Log in with SSO": collect the work email, look up the org's IdP by domain, and
// hand off to the SP-initiated flow. No password — the identity provider vouches.
async function startSso(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect("/sso?error=email");
  let connectionId: string | null = null;
  try {
    connectionId = (await ssoDiscover(email)).connection_id;
  } catch {
    redirect("/sso?error=unavailable");
  }
  if (!connectionId) redirect("/sso?error=none");
  redirect(`/sso/${connectionId}/start`);
}

const ERRORS: Record<string, string> = {
  email: "Enter a valid work email.",
  none: "No single sign-on is set up for that email domain. Sign in with your password instead.",
  unavailable: "We couldn't reach single sign-on just now. Try again.",
  saml: "Sign-in from your identity provider failed. Try again, or contact your admin.",
};

export default async function SsoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Single sign-on</CardTitle>
            <CardDescription>
              Enter your work email and we&apos;ll take you to your organization&apos;s identity
              provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ERRORS[error] ?? "Something went wrong."}
              </p>
            ) : null}
            <form action={startSso} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@company.com" />
              </div>
              <Button type="submit" className="w-full">
                Continue with SSO
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
