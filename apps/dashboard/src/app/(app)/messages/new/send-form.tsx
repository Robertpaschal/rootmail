"use client";

import { useActionState, useState } from "react";
import { Code2, FileText, Loader2, PenLine, Send } from "lucide-react";
import { sendMessage, type SendState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

// Writing an email should feel like writing an email. Plain text becomes clean
// HTML paragraphs on send; templates are picked, not typed; raw HTML stays
// available for developers — behind a deliberate tab, never as the default.
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

type Mode = "write" | "template" | "html";

const MODES: { id: Mode; label: string; icon: typeof PenLine }[] = [
  { id: "write", label: "Write", icon: PenLine },
  { id: "template", label: "Use a template", icon: FileText },
  { id: "html", label: "HTML", icon: Code2 },
];

export function SendForm({
  tenants,
  templates,
}: {
  tenants: SubTenant[];
  templates: { slug: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<SendState | null, FormData>(
    sendMessage,
    null,
  );
  const [mode, setMode] = useState<Mode>("write");
  const [message, setMessage] = useState(
    "Hi there,\n\nThis is my first email through rootmail — written like a normal email, delivered like one too.\n\nBest,\nMe",
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
                <option value="transactional">Transactional — receipts, resets</option>
                <option value="marketing">Marketing — promotions, newsletters</option>
                <option value="sales">Sales — outreach</option>
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
            <Input id="subject" name="subject" placeholder="What's this email about?" />
          </div>

          {/* The message — write it, pick a template, or (for devs) paste HTML. */}
          <div className="grid gap-2">
            <div className="inline-flex w-fit rounded-lg border p-0.5 text-sm">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                    mode === m.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <m.icon className="size-3.5" /> {m.label}
                </button>
              ))}
            </div>

            {mode === "write" ? (
              <>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  placeholder={"Write your email like you normally would…\n\nA blank line starts a new paragraph."}
                />
                {/* The API receives clean HTML paragraphs; the plain-text part is added automatically. */}
                <input type="hidden" name="html" value={textToHtml(message)} />
                <p className="text-xs text-muted-foreground">
                  No HTML needed — paragraphs and line breaks arrive exactly as written.
                </p>
              </>
            ) : null}

            {mode === "template" ? (
              <>
                {templates.length > 0 ? (
                  <Select id="template" name="template" defaultValue="">
                    <option value="" disabled>
                      Choose a saved template
                    </option>
                    {templates.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No templates yet — create one under Content → Templates, or import HTML you
                    already have.
                  </p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="variables">Personalization (optional)</Label>
                  <Textarea id="variables" name="variables" rows={2} placeholder={'{"name":"Ada"}'} />
                  <p className="text-xs text-muted-foreground">
                    Fills the template&apos;s <span className="font-mono">{"{{placeholders}}"}</span>{" "}
                    — leave empty if it has none.
                  </p>
                </div>
              </>
            ) : null}

            {mode === "html" ? (
              <>
                <Textarea
                  id="html"
                  name="html"
                  rows={8}
                  defaultValue={"<h1>Hello from rootmail 👋</h1>\n<p>Raw HTML, exactly as you provide it.</p>"}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  For developers: sent as-is. A plain-text part is generated automatically.
                </p>
              </>
            ) : null}
          </div>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              Advanced (for developers)
            </summary>
            <div className="grid gap-2 pb-1 pt-3">
              <Label htmlFor="idempotency_key">Idempotency key</Label>
              <Input
                id="idempotency_key"
                name="idempotency_key"
                placeholder="welcome-123"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Retries with the same key never send twice.</p>
            </div>
          </details>

          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {pending ? "Sending…" : "Send email"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
