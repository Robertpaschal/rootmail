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
import { sendingProviderLabel } from "@/lib/provider-copy";
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
  // Bring-your-own-provider (beta). Only the API decides this; unflagged orgs
  // see exactly the card they saw before.
  const byo = current?.byo === true;
  const [choice, setChoice] = useState<"ses" | "ses_role" | "mailgun" | "smtp">(current?.provider ?? "ses");
  const [state, action, pending] = useActionState<ProviderState, FormData>(
    connectSendingProvider,
    {},
  );
  const [busy, setBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const value = connected ? (
    <span className="inline-flex items-center gap-2">
      <StateBadge tone={current?.status === "active" && !(byo && current?.last_error) ? "ok" : "warn"}>
        {sendingProviderLabel(current?.provider)}
      </StateBadge>
      <span className="text-xs text-muted-foreground">
        {current?.status === "active"
          ? "your account"
          : current?.status === "awaiting_feedback"
            ? "waiting for your SNS subscription to confirm"
            : (current?.last_error ?? current?.status)}
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
        byo
          ? connected
            ? "Mail leaves through your provider, on your domain and your reputation. Rootmail keeps the record, the suppression list and the proof."
            : "Mail sends through Rootmail's account, inside its beta limits. Connect your own to send on your domain, without the daily cap."
          : connected
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

        {byo && connected ? <ByoDetails current={current!} /> : null}

        {connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Connected to{" "}
              <span className="font-medium">
                {sendingProviderLabel(current?.provider)}
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
              onChange={(e) => setChoice(e.target.value as "ses" | "ses_role" | "mailgun" | "smtp")}
            >
              <option value="ses">{current?.assume_role ? "Amazon SES (access keys)" : "Amazon SES"}</option>
              {/* Only when ops configured our assumer role (the API refuses it otherwise). */}
              {byo && current?.assume_role ? <option value="ses_role">Amazon SES (IAM role)</option> : null}
              <option value="mailgun">Mailgun</option>
              {/* SMTP is bring-your-own only: the API refuses it for other orgs. */}
              {byo ? <option value="smtp">SMTP server</option> : null}
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
                <code className="font-mono">ses:GetAccount</code>
                {byo ? (
                  <>
                    {" "}and <code className="font-mono">ses:ListEmailIdentities</code>
                  </>
                ) : null}
                . We check them before saving, and store them encrypted.
              </p>
            </div>
            {byo ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sns_topic_arn">SNS topic for bounces and complaints</Label>
                  <Input id="sns_topic_arn" name="sns_topic_arn" placeholder="arn:aws:sns:us-east-1:123456789012:ses-feedback" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="configuration_set">Configuration set (optional)</Label>
                  <Input id="configuration_set" name="configuration_set" placeholder="your own set, if any" autoComplete="off" />
                </div>
              </div>
            ) : null}
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
            {byo ? (
              <div className="space-y-2">
                <Label htmlFor="webhook_signing_key">Webhook signing key</Label>
                <Input id="webhook_signing_key" name="webhook_signing_key" type="password" autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  Mailgun → Settings → Webhooks. We use it to check that bounces and complaints really came from Mailgun.
                </p>
              </div>
            ) : null}
          </div>

          {byo && current?.assume_role ? (
            <div className={cn("space-y-4", choice === "ses_role" ? "" : "hidden")}>
              <RoleSetup setup={current.assume_role} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role_arn">Role ARN</Label>
                  <Input id="role_arn" name="role_arn" placeholder="arn:aws:iam::123456789012:role/rootmail-sender" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role_region">Region</Label>
                  <Input id="role_region" name="role_region" defaultValue="us-east-1" autoComplete="off" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role_sns_topic_arn">SNS topic for bounces and complaints</Label>
                  <Input id="role_sns_topic_arn" name="role_sns_topic_arn" placeholder="arn:aws:sns:us-east-1:123456789012:ses-feedback" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role_configuration_set">Configuration set (optional)</Label>
                  <Input id="role_configuration_set" name="role_configuration_set" placeholder="your own set, if any" autoComplete="off" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                No keys are stored: we assume the role for 15 minutes at a time. We check it before saving and send nothing.
              </p>
            </div>
          ) : null}

          {byo ? (
            <div className={cn("space-y-4", choice === "smtp" ? "" : "hidden")}>
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-2">
                  <Label htmlFor="smtp_host">Server hostname</Label>
                  <Input id="smtp_host" name="smtp_host" placeholder="smtp.yourcompany.com" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_port">Port</Label>
                  <Select id="smtp_port" name="smtp_port" defaultValue="587">
                    <option value="587">587 (STARTTLS)</option>
                    <option value="465">465 (TLS)</option>
                    <option value="2525">2525 (STARTTLS)</option>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                We recommend 587 or 465. The connection must be encrypted: TLS on 465, STARTTLS on
                587 and 2525. Port 25 isn&apos;t supported.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp_username">Username</Label>
                  <Input id="smtp_username" name="smtp_username" autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_password">Password</Label>
                  <Input id="smtp_password" name="smtp_password" type="password" autoComplete="off" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_sending_domains">Domains this server sends for</Label>
                <Input id="smtp_sending_domains" name="smtp_sending_domains" placeholder="yourcompany.com, mail.yourcompany.com" autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  Your From address must be on one of these. Your server signs DKIM, as it does today.
                </p>
              </div>
              <p className="rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Limitation:</span> SMTP has no event feed,
                so bounces go back to your own mailbox, not to Rootmail, and we can&apos;t add them to
                your suppression list automatically. Unsubscribes are still suppressed. Because of
                that, an SMTP connection sends up to 500 transactional and 500 marketing emails a day. We log in to check the
                details before saving; we don&apos;t send a test message.
              </p>
            </div>
          ) : null}

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

/** What a BYO tenant needs to see once connected. Never a secret — only its hint. */
function ByoDetails({ current }: { current: SendingProvider }) {
  return (
    <dl className="space-y-2 text-sm">
      {current.last_error ? (
        <p className="rounded-lg border border-stopped/40 p-3 text-sm text-stopped" role="alert">
          Your provider refused the last attempt: {current.last_error}
        </p>
      ) : null}
      {current.credential_hint ? (
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Secret saved</dt>
          <dd className="font-mono">{current.credential_hint}</dd>
          <dd className="text-muted-foreground">Re-enter to change it.</dd>
        </div>
      ) : null}
      <div className="flex gap-2">
        <dt className="text-muted-foreground">{current.provider === "smtp" ? "Sends as" : "Verified there"}</dt>
        <dd>{current.sending_domains?.length ? current.sending_domains.join(", ") : "nothing yet"}</dd>
      </div>
      {current.feedback?.kind === "none" ? (
        <div className="space-y-1">
          <dt className="text-muted-foreground">Bounces and complaints</dt>
          <dd className="text-xs">No feedback loop. {current.feedback.note}</dd>
        </div>
      ) : null}
      {current.webhook_url ? (
        <div className="space-y-1">
          <dt className="text-muted-foreground">
            {current.provider === "mailgun"
              ? "Point Mailgun's permanent failure, complaint and unsubscribe webhooks at"
              : "Subscribe this HTTPS URL to your SNS topic"}
          </dt>
          <dd className="break-all font-mono text-xs">{current.webhook_url}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The two policies a tenant pastes into IAM to let Rootmail assume their role. */
function RoleSetup({ setup }: { setup: NonNullable<SendingProvider["assume_role"]> }) {
  return (
    <div className="space-y-3 rounded-lg border p-3 text-xs leading-relaxed">
      <p className="text-muted-foreground">
        Create a role Rootmail can assume. Use this external ID exactly:{" "}
        <code className="font-mono text-foreground">{setup.external_id}</code>. It needs{" "}
        <code className="font-mono">ses:SendEmail</code>, <code className="font-mono">ses:GetAccount</code> and{" "}
        <code className="font-mono">ses:ListEmailIdentities</code>, nothing else.
      </p>
      <div className="space-y-1">
        <p className="font-medium">Trust policy</p>
        <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono">{JSON.stringify(setup.trust_policy, null, 2)}</pre>
      </div>
      <div className="space-y-1">
        <p className="font-medium">Permissions policy</p>
        <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono">{JSON.stringify(setup.permissions_policy, null, 2)}</pre>
      </div>
    </div>
  );
}
