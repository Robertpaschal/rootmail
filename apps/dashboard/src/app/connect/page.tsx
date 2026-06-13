"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { connect, type ConnectState } from "./actions";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ConnectPage() {
  const [state, formAction, pending] = useActionState<ConnectState | null, FormData>(connect, null);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Connect to your workspace</CardTitle>
            <CardDescription>
              Paste a rootmail API key. It&apos;s stored in a secure, http-only cookie on the server —
              never exposed to the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">API key</Label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  placeholder="rm_live_… or rm_test_…"
                  autoComplete="off"
                  autoFocus
                  className="font-mono"
                />
              </div>
              {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {pending ? "Connecting…" : "Connect"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Run <code className="rounded bg-muted px-1 py-0.5 font-mono">pnpm db:seed</code> to print a
          key, or copy one from your terminal.
        </p>
      </div>
    </div>
  );
}
