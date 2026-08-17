import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "../oauth-buttons";
import { SignupForm } from "./signup-form";

// Render per-request so OAuth provider buttons reflect runtime env (the OAuth
// creds are injected at runtime, not baked at build) — otherwise they'd be
// statically empty.
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  // The invite email links here with the code already attached, so a tester
  // never has to copy it by hand — and "Continue with Google" can carry it too.
  // `add=1` arrives from "Add another account" — a second identity for a browser
  // that already has one. The beta gate is untouched: the API still demands an
  // invite code to CREATE an account, through this door like any other.
  searchParams: Promise<{ invite_code?: string; error?: string; add?: string }>;
}) {
  const { invite_code: inviteCode, error, add } = await searchParams;
  const adding = add === "1";
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {adding ? "Create another account" : "Create your account"}
            </CardTitle>
            <CardDescription>
              Free to start. You get a live workspace and a sandbox for safe testing — send your
              first email in minutes, nothing to install.
              {adding
                ? " The account you're already signed into stays signed in — switch between them from the menu in the top bar."
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <OAuthButtons inviteCode={inviteCode} add={adding} />
            <SignupForm inviteCode={inviteCode} add={adding} />
            {/* Someone arriving straight from an invite link never saw
                rootmail.io/beta, so this is their only warning that an
                unfamiliar email from Amazon is coming — and until they click
                it, we cannot send them anything at all. Placed after the form:
                it explains what happens next rather than interrupting the
                thing they came here to do. */}
            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <p className="text-sm font-medium">Expect one email from Amazon</p>
              <p className="mt-1 text-sm text-muted-foreground">
                While rootmail is in beta, our email provider asks every tester to confirm their
                address once. It comes from{" "}
                <span className="font-medium text-foreground">Amazon Web Services</span>, subject
                &ldquo;Email Address Verification Request&rdquo;. It&apos;s genuine — click the link
                inside, and everything from us arrives normally afterwards.
              </p>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={adding ? "/login?add=1" : "/login"}
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
          {adding ? (
            <>
              {" · "}
              <Link href="/" className="font-medium text-foreground hover:underline">
                Cancel
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
