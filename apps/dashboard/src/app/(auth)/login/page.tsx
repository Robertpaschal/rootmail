import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "../oauth-buttons";
import { LoginForm } from "./login-form";

// Render per-request so OAuth buttons reflect runtime env (creds injected at
// runtime, not baked at build).
export const dynamic = "force-dynamic";

/**
 * Why an "add another account" was turned away, worded for the person who
 * tried. Keyed by the `refused` reason the social/SAML callbacks redirect with;
 * an unknown key renders nothing rather than echoing a stranger's query string
 * back onto the page.
 */
const REFUSALS: Record<string, string> = {
  full: "This browser is already holding as many accounts as it can. Sign out of one from the account menu, then add this one.",
  impersonating:
    "You're signed in as a customer for support. Stop impersonating before adding another account.",
  unavailable: "We couldn't check your other accounts just now. Try again in a moment.",
};

export default async function LoginPage({
  searchParams,
}: {
  // `add=1` arrives from "Add another account" in the app. The page has to look
  // different, or someone who is already signed in reads a bare "Sign in" as
  // proof they were logged out.
  searchParams: Promise<{ reset?: string; add?: string; expired?: string; refused?: string }>;
}) {
  const { reset, add, expired, refused } = await searchParams;
  const adding = add === "1";
  // The social/SAML doors can only discover a refusal AFTER the provider has
  // vouched, so they revoke the session they minted and send the reason here.
  const refusal = REFUSALS[refused ?? ""] ?? null;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{adding ? "Add another account" : "Sign in"}</CardTitle>
            <CardDescription>
              {adding
                ? "Sign in with a different email. Your current account stays signed in — you'll be able to switch between them from the menu in the top bar."
                : "Welcome back. Sign in to your rootmail workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reset ? (
              <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Your password was reset. Sign in with your new password.
              </p>
            ) : null}
            {expired ? (
              <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Your session expired. Sign in again to pick up where you left off.
              </p>
            ) : null}
            {refusal ? (
              <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {refusal}
              </p>
            ) : null}
            <OAuthButtons add={adding} />
            <LoginForm add={adding} />
            <div className="mt-4 border-t pt-4 text-center">
              <Link
                href={adding ? "/sso?add=1" : "/sso"}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Log in with single sign-on (SSO)
              </Link>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {adding ? (
            <>
              Need a brand-new account?{" "}
              <Link href="/signup?add=1" className="font-medium text-foreground hover:underline">
                Create one
              </Link>
              {" · "}
              <Link href="/" className="font-medium text-foreground hover:underline">
                Cancel
              </Link>
            </>
          ) : (
            <>
              New to rootmail?{" "}
              <Link href="/signup" className="font-medium text-foreground hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
