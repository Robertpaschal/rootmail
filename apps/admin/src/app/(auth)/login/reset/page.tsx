import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

// The token is in this page's URL. Don't hand it to anything this page links to.
export const metadata: Metadata = { title: "Choose a new staff password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Choose a new staff password</CardTitle>
            <CardDescription>
              At least 10 characters. Saving it signs out every staff session for this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {token ? (
              <ResetForm token={token} />
            ) : (
              <p className="text-sm text-destructive">This reset link is incomplete. Ask for a new one.</p>
            )}
            <p className="text-center text-sm">
              <Link href="/login/forgot" className="text-muted-foreground underline underline-offset-4">
                Ask for a new link
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
