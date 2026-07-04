"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, KeyRound, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SsoConnection } from "@/lib/types";
import { deleteSsoConnection, saveSsoConnection, type SsoState } from "./actions";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SsoManager({ connection }: { connection: SsoConnection | null }) {
  const [editing, setEditing] = useState(connection === null);
  const [state, action] = useActionState<SsoState, FormData>(saveSsoConnection, {});
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // A fresh save drops back to the view.
  if (state.ok && editing) setEditing(false);

  return (
    <div className="space-y-6">
      {connection ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service provider details</CardTitle>
            <CardDescription>
              Paste these into your identity provider (Okta, Entra ID, Google Workspace, …) when you
              create the rootmail SAML app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CopyRow label="SP entity ID (audience)" value={connection.sp_entity_id} />
            <CopyRow label="ACS / reply URL" value={connection.acs_url} />
            <CopyRow label="SP metadata URL" value={connection.metadata_url} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Identity provider</CardTitle>
            <CardDescription>
              {connection
                ? "The SAML identity provider members sign in through."
                : "Connect your SAML identity provider to enable single sign-on."}
            </CardDescription>
          </div>
          {connection && !editing ? (
            <Badge variant={connection.active ? "success" : "muted"}>
              {connection.active ? "active" : "disabled"}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          {connection && !editing ? (
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Email domain" value={connection.email_domain} />
                <Field label="Default role" value={connection.default_role} />
                <Field label="IdP entity ID" value={connection.idp_entity_id} mono />
                <Field label="IdP sign-in URL" value={connection.idp_sso_url} mono />
                <Field
                  label="Enforcement"
                  value={connection.enforced ? "Password login blocked for this domain" : "Optional"}
                />
              </dl>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (!confirm("Remove SSO? Members will sign in with a password again.")) return;
                    setRemoveError(null);
                    startRemove(async () => {
                      const res = await deleteSsoConnection();
                      if (res.error) setRemoveError(res.error);
                      else setEditing(true);
                    });
                  }}
                >
                  {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Remove
                </Button>
              </div>
              {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
            </div>
          ) : (
            <form action={action} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email_domain">Email domain</Label>
                  <Input
                    id="email_domain"
                    name="email_domain"
                    defaultValue={connection?.email_domain}
                    placeholder="acme.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="default_role">Default role for new members</Label>
                  <select
                    id="default_role"
                    name="default_role"
                    defaultValue={connection?.default_role ?? "member"}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idp_entity_id">IdP entity ID (issuer)</Label>
                <Input
                  id="idp_entity_id"
                  name="idp_entity_id"
                  defaultValue={connection?.idp_entity_id}
                  placeholder="http://www.okta.com/exk…"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idp_sso_url">IdP sign-in URL</Label>
                <Input
                  id="idp_sso_url"
                  name="idp_sso_url"
                  type="url"
                  defaultValue={connection?.idp_sso_url}
                  placeholder="https://your-org.okta.com/app/…/sso/saml"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idp_certificate">IdP x509 signing certificate</Label>
                <textarea
                  id="idp_certificate"
                  name="idp_certificate"
                  required={!connection}
                  rows={5}
                  placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {connection ? (
                  <p className="text-xs text-muted-foreground">
                    Paste the certificate again to rotate it; leave blank to keep the current one.
                  </p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="enforced"
                    defaultChecked={connection?.enforced}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-medium">Require SSO</span>
                    <span className="block text-xs text-muted-foreground">
                      Block password login for {connection?.email_domain || "this domain"} — everyone
                      signs in through your IdP.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={connection?.active ?? true}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-medium">Active</span>
                    <span className="block text-xs text-muted-foreground">
                      Turn the connection off without deleting it.
                    </span>
                  </span>
                </label>
              </div>

              {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <div className="flex items-center gap-2">
                <SaveButton />
                {connection ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={mono ? "mt-0.5 truncate font-mono text-xs" : "mt-0.5 text-sm capitalize"}>{value}</dd>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
      Save connection
    </Button>
  );
}
