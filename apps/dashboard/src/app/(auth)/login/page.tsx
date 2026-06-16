import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "../oauth-buttons";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Welcome back. Sign in to your rootmail workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {reset ? (
              <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Your password was reset. Sign in with your new password.
              </p>
            ) : null}
            <OAuthButtons />
            <LoginForm />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New to rootmail?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
