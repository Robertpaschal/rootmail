"use client";

import { useActionState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { login, verifyMfa, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [loginState, loginAction, loginPending] = useActionState<AuthState | null, FormData>(login, null);
  const [mfaState, mfaAction, mfaPending] = useActionState<AuthState | null, FormData>(verifyMfa, null);

  // The challenge token comes from the login response, then from the MFA state
  // after a failed code. Show the code form while either still needs it.
  const mfaToken = mfaState?.mfaToken ?? loginState?.mfaToken;
  if (mfaToken && (loginState?.mfaRequired || mfaState?.mfaRequired)) {
    return (
      <form action={mfaAction} className="space-y-4">
        <input type="hidden" name="mfa_token" value={mfaToken} />
        <div className="space-y-2">
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
          />
          <p className="text-xs text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Use a recovery code instead</summary>
          <Input name="recovery_code" placeholder="xxxxx-xxxxx" className="mt-2" autoComplete="off" />
        </details>
        {mfaState?.error ? <p className="text-sm text-destructive">{mfaState.error}</p> : null}
        <Button type="submit" className="w-full" disabled={mfaPending}>
          {mfaPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {mfaPending ? "Verifying…" : "Verify"}
        </Button>
      </form>
    );
  }

  return (
    <form action={loginAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            Forgot password?
          </a>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {loginState?.error ? <p className="text-sm text-destructive">{loginState.error}</p> : null}
      <Button type="submit" className="w-full" disabled={loginPending}>
        {loginPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {loginPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
