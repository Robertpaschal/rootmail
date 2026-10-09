import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionToken } from "@/lib/session";
import { VerifyForm } from "./verify-form";

// Reached from the verification email, signed in or not (see EMAIL_LINK_PATHS in
// middleware). Loading this page spends nothing: the token is only used when the
// person presses the button, and no cookie is read for anything but choosing the
// next link — so it can neither sign anyone out nor sign anyone in.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const signedIn = Boolean(await getSessionToken());

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Confirm your email</CardTitle>
            <CardDescription>One click and live sending is unlocked.</CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <VerifyForm token={token} signedIn={signedIn} />
            ) : (
              <p className="text-sm text-destructive">
                This link is missing its code.{" "}
                <Link href={signedIn ? "/" : "/login"} className="underline">
                  {signedIn ? "Back to the dashboard" : "Sign in"}
                </Link>{" "}
                and resend a fresh link from the banner.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
