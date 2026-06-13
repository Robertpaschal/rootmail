"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { sendMessage, type SendState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SubTenant } from "@/lib/types";

const DEFAULT_HTML = `<h1>Hello from rootmail 👋</h1>
<p>This is a test send through the live pipeline.</p>`;

export function SendForm({ tenants }: { tenants: SubTenant[] }) {
  const [state, formAction, pending] = useActionState<SendState | null, FormData>(
    sendMessage,
    null,
  );

  return (
    <Card className="max-w-2xl">
      <CardContent className="p-6">
        <form action={formAction} className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="email" placeholder="ada@example.com" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="transactional">
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
                <option value="sales">Sales</option>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue="normal">
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </div>
          </div>

          {tenants.length > 0 ? (
            <div className="grid gap-2">
              <Label htmlFor="sub_tenant_id">Send as</Label>
              <Select id="sub_tenant_id" name="sub_tenant_id" defaultValue="">
                <option value="">Workspace (default domain)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.sending_domain}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" defaultValue="Welcome to rootmail" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="html">HTML body</Label>
            <Textarea id="html" name="html" rows={5} defaultValue={DEFAULT_HTML} />
            <p className="text-xs text-muted-foreground">
              Or set a <span className="font-mono">template</span> slug below to render a saved
              template instead.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="template">Template slug (optional)</Label>
              <Input id="template" name="template" placeholder="welcome" className="font-mono" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="idempotency_key">Idempotency key (optional)</Label>
              <Input
                id="idempotency_key"
                name="idempotency_key"
                placeholder="welcome-123"
                className="font-mono"
              />
            </div>
          </div>

          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {pending ? "Sending…" : "Send message"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
