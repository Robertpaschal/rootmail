"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, Server } from "lucide-react";
import { connectSendingProvider, disconnectSendingProvider, type ProviderState } from "./actions";
import { SettingsItem, StateBadge } from "../setting-item";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SendingProvider } from "@/lib/types";

/**
 * Which account your mail leaves from.
 *
 * The honest framing, and the reason this exists: if you already send email, you
 * already have a provider and a reputation you have earned. rootmail's value is
 * the layer above it — per-client domains, per-client reputation, suppression,
 * proof — not the delivery. Connecting your own account means your mail sends on
 * your credentials and your limits, and our provider's approval stops being
 * something you have to wait on.
 *
 * Credentials are checked against the live provider before they are saved, so an
 * error here is a real answer from AWS or Mailgun. It is shown verbatim: "that
 * AWS account is still in the SES sandbox" is actionable, "couldn't connect" is
 * not.
 */
export function SendingAccount({ current }: { current: SendingProvider | null }) {
  const connected = Boolean(current?.id);
  const [choice, setChoice] = useState<"ses" | "mailgun">(current?.provider ?? "ses");
  const [state, action, pending] = useActionState<ProviderState, FormData>(
    connectSendingProvider,
    {},
  );
  const [busy, setBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const value = connected ? (
    <span className="inline-flex items-center gap-2">
      <StateBadge tone={current?.status === "active" ? "ok" : "warn"}>
        {current?.provider === "mailgun" ? "Mailgun" : "Amazon SES"}
      </StateBadge>
      <span className="text-xs text-muted-foreground">
        {current?.status === "active" ? "your account" : (current?.last_error ?? current?.status)}
      </span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-2">
      <StateBadge tone="muted">rootmail</StateBadge>
      <span className="text-xs text-muted-foreground">sending through our account</span>
    </span>
  );

  return (
    <SettingsItem
      label="Sending account"
      description={
        connected
          ? "Your mail sends through your own provider — your domains, your reputation, your limits."
          : "Your mail sends through rootmail's account today. Connect your own and it sends from yours instead."
      }
      value={value}
      openLabel={connected ? "Change" : "Connect your own"}
    >
      <div className="space-y-4 pt-1">
        {/* Why anyone would do this, said once, plainly. */}
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          <Server className="mr-1.5 inline size-3.5 align-[-2px]" />
          If you already send email, you already have a provider and a reputation you built. Connect
          it and rootmail becomes the layer on top — per-client domains, per-client reputation,
          suppression and proof — while delivery stays on your account. Nothing about your existing
          setup changes.
        </p>

        {connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Connected to{" "}
              <span className="font-medium">
                {current?.provider === "mailgun" ? "Mailgun" : "Amazon SES"}
              </span>
              {current?.sending_domain ? (
                <span className="text-muted-foreground"> · {current.sending_domain}</span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setDisconnectError(null);
                const r = await disconnectSendingProvider();
                setBusy(false);
                if (r.error) setDisconnectError(r.error);
              }}
            >
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Disconnect
            </Button>
            {disconnectError ? (
              <p className="w-full text-sm text-stopped">{disconnectError}</p>
            ) : null}
          </div>
        ) : null}

        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              id="provider"
              name="provider"
              value={choice}
              onChange={(e) => setChoice(e.target.value as "ses" | "mailgun")}
            >
              <option value="ses">Amazon SES</option>
              <option value="mailgun">Mailgun</option>
            </Select>
          </div>

          {/* Both field sets stay MOUNTED — an unmounted field does not submit,
              and hiding is what keeps the other provider's values out of the
              payload without losing what someone typed while switching. */}
          <div className={cn("space-y-4", choice === "ses" ? "" : "hidden")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="access_key_id">Access key ID</Label>
                <Input id="access_key_id" name="access_key_id" placeholder="AKIA…" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" defaultValue="us-east-1" autoComplete="off" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret_access_key">Secret access key</Label>
              <Input
                id="secret_access_key"
                name="secret_access_key"
                type="password"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Needs <code className="font-mono">ses:SendEmail</code> and{" "}
                <code className="font-mono">ses:GetAccount</code>. We check them before saving, and
                store them encrypted.
              </p>
            </div>
          </div>

          <div className={cn("space-y-4", choice === "mailgun" ? "" : "hidden")}>
            <div className="space-y-2">
              <Label htmlFor="api_key">API key</Label>
              <Input id="api_key" name="api_key" type="password" autoComplete="off" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="domain">Sending domain</Label>
                <Input id="domain" name="domain" placeholder="mg.yourcompany.com" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mg_region">Region</Label>
                <Select id="mg_region" name="mg_region" defaultValue="us">
                  <option value="us">US</option>
                  <option value="eu">EU</option>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The domain must already be verified at Mailgun — we check before saving.
            </p>
          </div>

          {state.error ? (
            <p className="text-sm text-stopped" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="flex items-center gap-1.5 text-sm text-witnessed">
              <CheckCircle2 className="size-4" /> {state.ok}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={cn(buttonVariants({ size: "sm" }))}>
            {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {pending ? "Checking with the provider…" : connected ? "Replace connection" : "Connect"}
          </button>
        </form>
      </div>
    </SettingsItem>
  );
}
