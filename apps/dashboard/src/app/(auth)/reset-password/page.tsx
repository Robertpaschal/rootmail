import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Choose a new password</CardTitle>
            <CardDescription>Set a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <ResetForm token={token} />
            ) : (
              <p className="text-sm text-destructive">
                This reset link is missing its token. Request a new one from the{" "}
                <Link href="/forgot-password" className="underline">
                  forgot password
                </Link>{" "}
                page.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
