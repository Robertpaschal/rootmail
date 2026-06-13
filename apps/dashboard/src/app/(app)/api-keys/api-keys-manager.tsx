"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { createApiKey, revokeApiKey } from "./actions";
import { CopyButton } from "@/components/app/copy-button";
import { EmptyState } from "@/components/app/empty-state";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import type { ApiKey } from "@/lib/types";

interface Props {
  keys: ApiKey[];
  currentKey: { prefix: string; last4: string } | null;
}

export function ApiKeysManager({ keys, currentKey }: Props) {
  const [state, formAction] = useActionState(createApiKey, null);
  const [dismissed, setDismissed] = useState(false);

  // A fresh secret resets the reveal so a previous dismissal doesn't hide it.
  useEffect(() => {
    if (state?.secret) setDismissed(false);
  }, [state?.secret]);

  const isCurrent = (k: ApiKey) =>
    currentKey != null && k.prefix === currentKey.prefix && k.last4 === currentKey.last4;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a key</CardTitle>
          <CardDescription>
            New keys inherit this workspace&apos;s mode. The full secret is shown once, right after
            creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="name">Key name</Label>
              <Input id="name" name="name" placeholder="Production server" required />
            </div>
            <SubmitButton pendingLabel="Creating…">
              <Plus className="size-4" /> Create key
            </SubmitButton>
          </form>
          {state?.error ? <p className="mt-3 text-sm text-destructive">{state.error}</p> : null}

          {state?.secret && !dismissed ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <ShieldAlert className="size-4" />
                Copy your key now — you won&apos;t be able to see it again.
              </div>
              {state.name ? (
                <p className="mt-1 text-xs text-amber-800">For &ldquo;{state.name}&rdquo;</p>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-sm">
                  {state.secret}
                </code>
                <CopyButton value={state.secret} />
                <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="size-6" />}
          title="No API keys yet"
          description="Create one to start sending through the REST API or the @rootmail/node SDK."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} className={k.revoked ? "opacity-55" : undefined}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {k.name}
                        {isCurrent(k) ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            In use
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {k.prefix}_…{k.last4}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.mode === "live" ? "secondary" : "outline"}>{k.mode}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {k.last_used_at ? relativeTime(k.last_used_at) : "Never"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {relativeTime(k.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.revoked ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : isCurrent(k) ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <RevokeButton id={k.id} name={k.name} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Using your key</CardTitle>
          <CardDescription>Pass it as a Bearer token. That&apos;s the only setup a service needs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
            <code className="font-mono">{`curl https://api.rootmail.dev/v1/messages \\
  -H "Authorization: Bearer rm_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"ada@example.com","subject":"Hi","html":"<p>Hello</p>"}'`}</code>
          </pre>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
            <code className="font-mono">{`import { Rootmail } from "@rootmail/node";

const rootmail = new Rootmail({ apiKey: process.env.ROOTMAIL_API_KEY });
await rootmail.messages.send({ to: "ada@example.com", subject: "Hi", html: "<p>Hello</p>" });`}</code>
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function RevokeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${name}"? Anything using this key will stop working immediately.`)) {
          return;
        }
        const fd = new FormData();
        fd.set("id", id);
        start(() => revokeApiKey(fd));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Revoke
    </Button>
  );
}
