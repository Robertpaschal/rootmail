import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "../oauth-buttons";
import { SignupForm } from "./signup-form";

// Render per-request so OAuth provider buttons reflect runtime env (the OAuth
// creds are injected at runtime, not baked at build) — otherwise they'd be
// statically empty.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>
              Free to start. You get a live workspace and a sandbox for safe testing — send your
              first email in minutes, nothing to install.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OAuthButtons />
            <SignupForm />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
