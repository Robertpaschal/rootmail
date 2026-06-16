"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { activateMfa, disableMfa, startMfaSetup, type MfaActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MfaCard({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string; qr: string } | null>(null);
  const [starting, startStarting] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);
  const [activateState, activateAction, activatePending] = useActionState<MfaActionState | null, FormData>(activateMfa, null);
  const [disableState, disableAction, disablePending] = useActionState<MfaActionState | null, FormData>(disableMfa, null);

  // Just enabled — show the one-time recovery codes.
  if (activateState?.recoveryCodes) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <ShieldCheck className="size-4" /> Two-factor authentication is on.
        </p>
        <div>
          <p className="text-sm font-medium">Save your recovery codes</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Each works once if you lose your authenticator. Store them somewhere safe — you won&apos;t see them again.
          </p>
          <ul className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            {activateState.recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Already on — offer to turn it off.
  if (enabled) {
    return (
      <form action={disableAction} className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <ShieldCheck className="size-4" /> Two-factor authentication is on.
        </p>
        <p className="text-sm text-muted-foreground">
          To turn it off, confirm with a current code or your password.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            name="code"
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="sm:max-w-[160px]"
          />
          <Input name="password" type="password" placeholder="…or your password" autoComplete="current-password" />
        </div>
        {disableState?.error ? <p className="text-sm text-destructive">{disableState.error}</p> : null}
        <Button type="submit" variant="destructive" disabled={disablePending}>
          {disablePending ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
          {disablePending ? "Disabling…" : "Disable two-factor"}
        </Button>
      </form>
    );
  }

  // Mid-enrollment — scan the QR (or enter the secret), then confirm a code.
  if (setup) {
    return (
      <form action={activateAction} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scan this with your authenticator app, then enter the code it shows.
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr}
            alt="Authenticator QR code"
            width={180}
            height={180}
            className="rounded-md border bg-white p-2"
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Or enter this secret manually:</p>
            <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-sm">{setup.secret}</code>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
            className="max-w-[200px]"
          />
        </div>
        {activateState?.error ? <p className="text-sm text-destructive">{activateState.error}</p> : null}
        <Button type="submit" disabled={activatePending}>
          {activatePending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {activatePending ? "Verifying…" : "Turn on two-factor"}
        </Button>
      </form>
    );
  }

  // Initial — off.
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Two-factor authentication is <span className="font-medium text-foreground">off</span>. Add a layer of
        protection with an authenticator app (Google Authenticator, 1Password, etc.).
      </p>
      {startError ? <p className="text-sm text-destructive">{startError}</p> : null}
      <Button
        disabled={starting}
        onClick={() =>
          startStarting(async () => {
            setStartError(null);
            const res = await startMfaSetup();
            if ("error" in res) setStartError(res.error);
            else setSetup(res);
          })
        }
      >
        {starting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {starting ? "Starting…" : "Set up two-factor"}
      </Button>
    </div>
  );
}
