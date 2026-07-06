"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Code2, Loader2, Send } from "lucide-react";
import { sendMessage, type SendState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SubTenant } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ComposeTemplate {
  slug: string;
  name: string;
  subject: string;
  html: string;
}

// Compose looks and works like writing a real email: From / To / Subject / body,
// with a live preview of exactly what the recipient gets. Templates are woven in
// ("start from"), not a separate mode; raw HTML is a small toggle for the few who
// want it. No Type/Priority jargon — a one-off email here is product email; bulk
// marketing lives in Campaigns, which handles its own compliance footer.
function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/** Fill {{placeholders}} for the preview only — the server renders the real send. */
function fillVars(html: string, varsRaw: string): string {
  let vars: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(varsRaw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      vars = parsed as Record<string, unknown>;
    }
  } catch {
    /* typing in progress — leave placeholders visible */
  }
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) =>
    vars[k] != null ? String(vars[k]) : m,
  );
}

const PREVIEW_WRAP_START =
  '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;padding:8px 4px;">';

export function SendForm({
  tenants,
  templates,
  senders,
}: {
  tenants: SubTenant[];
  templates: ComposeTemplate[];
  senders: { email: string; display_name: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<SendState | null, FormData>(
    sendMessage,
    null,
  );

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [startFrom, setStartFrom] = useState(""); // "" = blank, else template slug
  const [message, setMessage] = useState("");
  const [rawHtml, setRawHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [varsRaw, setVarsRaw] = useState("");

  const template = templates.find((t) => t.slug === startFrom) ?? null;
  const hasPlaceholders = template ? /\{\{\s*\w+\s*\}\}/.test(template.html + template.subject) : false;

  const pickTemplate = (slug: string) => {
    setStartFrom(slug);
    const t = templates.find((x) => x.slug === slug);
    if (t && t.subject) setSubject(t.subject);
  };

  // What the recipient sees — the preview mirrors the send path.
  const previewHtml = useMemo(() => {
    if (template) return fillVars(template.html, varsRaw);
    if (rawHtml) return htmlDraft;
    return PREVIEW_WRAP_START + textToHtml(message) + "</div>";
  }, [template, varsRaw, rawHtml, htmlDraft, message]);

  const fromLabel = from.startsWith("id:")
    ? from.slice(3)
    : from.startsWith("st:")
      ? (tenants.find((t) => t.id === from.slice(3))?.sending_domain ?? "your domain")
      : "your workspace address";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* The email */}
      <Card>
        <CardContent className="p-0">
          <form action={formAction}>
            <div className="divide-y">
              {/* From — your verified addresses, your domains, or the workspace default */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">From</span>
                {senders.length > 0 || tenants.length > 0 ? (
                  <Select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 border-0 shadow-none focus-visible:ring-0"
                  >
                    <option value="">Workspace address</option>
                    {senders.map((s) => (
                      <option key={s.email} value={`id:${s.email}`}>
                        {s.display_name ? `${s.display_name} · ${s.email}` : s.email}
                      </option>
                    ))}
                    {tenants.map((t) => (
                      <option key={t.id} value={`st:${t.id}`}>
                        {t.name} · {t.sending_domain}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="flex-1 text-sm">
                    Workspace address{" "}
                    <Link
                      href="/settings/sender"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      send from your own address
                    </Link>
                  </span>
                )}
                {from.startsWith("id:") ? (
                  <input type="hidden" name="from_email" value={from.slice(3)} />
                ) : null}
                {from.startsWith("st:") ? (
                  <input type="hidden" name="sub_tenant_id" value={from.slice(3)} />
                ) : null}
              </div>

              {/* To */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">To</span>
                <input
                  name="to"
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="ada@example.com"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">Subject</span>
                <input
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this about?"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Start from — templates woven into composing */}
              {templates.length > 0 ? (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">Start from</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setStartFrom("")}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        !template ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Blank
                    </button>
                    {templates.slice(0, 6).map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => pickTemplate(t.slug)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          template?.slug === t.slug
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                  {template ? <input type="hidden" name="template" value={template.slug} /> : null}
                </div>
              ) : null}

              {/* Body */}
              <div className="px-5 py-4">
                {template ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Using the <span className="font-medium text-foreground">{template.name}</span>{" "}
                      template — the preview shows its content.
                    </p>
                    {hasPlaceholders ? (
                      <div className="space-y-1.5">
                        <label htmlFor="variables" className="text-sm font-medium">
                          Personalization
                        </label>
                        <Textarea
                          id="variables"
                          name="variables"
                          rows={2}
                          value={varsRaw}
                          onChange={(e) => setVarsRaw(e.target.value)}
                          placeholder={'{"name":"Ada"}'}
                        />
                        <p className="text-xs text-muted-foreground">
                          Fills the template&apos;s{" "}
                          <span className="font-mono">{"{{placeholders}}"}</span> — watch the
                          preview update.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : rawHtml ? (
                  <Textarea
                    name="html"
                    rows={12}
                    value={htmlDraft}
                    onChange={(e) => setHtmlDraft(e.target.value)}
                    placeholder="<p>Raw HTML, sent exactly as provided.</p>"
                    className="border-0 p-0 font-mono text-xs shadow-none focus-visible:ring-0"
                  />
                ) : (
                  <>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={12}
                      placeholder={"Write your email…\n\nA blank line starts a new paragraph."}
                      className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
                    />
                    <input type="hidden" name="html" value={PREVIEW_WRAP_START + textToHtml(message) + "</div>"} />
                  </>
                )}
              </div>
            </div>

            {/* Send bar */}
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {pending ? "Sending…" : "Send"}
              </Button>
              <div className="flex items-center gap-3">
                {!template ? (
                  <button
                    type="button"
                    onClick={() => setRawHtml((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                      rawHtml ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Code2 className="size-3.5" /> HTML
                  </button>
                ) : null}
                <details className="relative">
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
                    Advanced
                  </summary>
                  <div className="absolute bottom-7 right-0 z-10 w-64 rounded-lg border bg-card p-3 shadow-md">
                    <label htmlFor="idempotency_key" className="text-xs font-medium">
                      Idempotency key
                    </label>
                    <Input
                      id="idempotency_key"
                      name="idempotency_key"
                      placeholder="welcome-123"
                      className="mt-1 h-8 font-mono text-xs"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Retries with the same key never send twice.
                    </p>
                  </div>
                </details>
              </div>
            </div>
            {state?.error ? (
              <p className="border-t px-5 py-3 text-sm text-destructive">{state.error}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* The preview — exactly what lands in their inbox */}
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            What {to || "your recipient"} will see
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-lg border">
            <div className="space-y-0.5 border-b bg-muted/40 px-4 py-2.5 text-xs">
              <p>
                <span className="text-muted-foreground">From:</span> {fromLabel}
              </p>
              <p>
                <span className="text-muted-foreground">To:</span> {to || "—"}
              </p>
              <p className="font-medium">{subject || "(no subject)"}</p>
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[420px] w-full bg-white"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
