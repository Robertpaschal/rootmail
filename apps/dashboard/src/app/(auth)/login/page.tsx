import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "../oauth-buttons";
import { LoginForm } from "./login-form";

// Render per-request so OAuth buttons reflect runtime env (creds injected at
// runtime, not baked at build).
export const dynamic = "force-dynamic";

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
            <div className="mt-4 border-t pt-4 text-center">
              <Link
                href="/sso"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Log in with single sign-on (SSO)
              </Link>
            </div>
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
