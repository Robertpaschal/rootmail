import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset staff password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Reset staff password</CardTitle>
            <CardDescription>
              Enter your staff email. If it has a staff account, we&apos;ll email it a link that works once
              and expires in 30 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ForgotForm />
            <p className="text-center text-sm">
              <Link href="/login" className="text-muted-foreground underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
