import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let ok = false;
  if (token) {
    try {
      await api.verifyEmail(token);
      ok = true;
    } catch {
      ok = false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              {ok ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" /> Email verified
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-destructive" /> Verification failed
                </>
              )}
            </CardTitle>
            <CardDescription>
              {ok
                ? "Your email is confirmed — live sending is unlocked."
                : "This link is invalid or has already been used. Sign in and resend a fresh link from the banner."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="text-sm font-medium text-foreground hover:underline">
              Continue to dashboard →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
