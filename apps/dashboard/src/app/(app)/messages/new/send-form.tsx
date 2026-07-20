"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Film, ImageIcon, Loader2, Paperclip, Send, X } from "lucide-react";
import { sendMessage, uploadAttachmentAction, type SendState } from "../actions";
import { ComposeEditor } from "./compose-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Attachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

// Compose looks and works like writing a real email: From / To / Subject / body,
// a live preview of exactly what the recipient gets, and attachments. Templates are
// woven in ("start from"). There's no raw-HTML mode and no idempotency-key field —
// those are developer concerns handled by the API/SDK; the dashboard sends a
// generated idempotency key for you (shown afterward in the message's details).

/** Fill {{placeholders}} for the preview only — the server renders the real send. */
function fillVars(html: string, varsRaw: string): string {
  let vars: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(varsRaw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) vars = parsed as Record<string, unknown>;
  } catch {
    /* typing in progress — leave placeholders visible */
  }
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
}

const PREVIEW_WRAP_START =
  '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;padding:8px 4px;">';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <ImageIcon className="size-4" />;
  if (type.startsWith("video/")) return <Film className="size-4" />;
  return <FileText className="size-4" />;
}

export function SendForm({
  tenants,
  templates,
  senders,
  initialTo = "",
  initialSubject = "",
}: {
  tenants: SubTenant[];
  templates: ComposeTemplate[];
  senders: { email: string; display_name: string | null }[];
  initialTo?: string;
  initialSubject?: string;
}) {
  const [state, formAction, pending] = useActionState<SendState | null, FormData>(sendMessage, null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [startFrom, setStartFrom] = useState(""); // "" = blank, else template slug
  const [bodyHtml, setBodyHtml] = useState(""); // inner HTML from the compose editor
  const [varsRaw, setVarsRaw] = useState("");

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A generated idempotency key protects against a double-click sending twice.
  // Set after mount (client-only) to avoid an SSR/hydration mismatch.
  const [idemKey, setIdemKey] = useState("");
  useEffect(() => setIdemKey(crypto.randomUUID()), []);

  const template = templates.find((t) => t.slug === startFrom) ?? null;
  const hasPlaceholders = template ? /\{\{\s*\w+\s*\}\}/.test(template.html + template.subject) : false;

  const pickTemplate = (slug: string) => {
    setStartFrom(slug);
    const t = templates.find((x) => x.slug === slug);
    if (t && t.subject) setSubject(t.subject);
  };

  const composedHtml = PREVIEW_WRAP_START + (bodyHtml || "<p></p>") + "</div>";

  // What the recipient sees — the preview mirrors the send path.
  const previewHtml = useMemo(() => {
    if (template) return fillVars(template.html, varsRaw);
    return composedHtml;
  }, [template, varsRaw, composedHtml]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadAttachmentAction(fd);
      if (res.error) setAttachError(res.error);
      else if (res.id) setAttachments((a) => [...a, { id: res.id!, filename: res.filename ?? file.name, size: res.size ?? file.size, contentType: res.content_type ?? file.type }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

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
            {/* Internalized: a generated idempotency key (no field to fill). */}
            <input type="hidden" name="idempotency_key" value={idemKey} />
            <input type="hidden" name="attachments" value={JSON.stringify(attachments.map((a) => a.id))} />
            {!template ? <input type="hidden" name="html" value={composedHtml} /> : null}

            <div className="divide-y">
              {/* From */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">From</span>
                {senders.length > 0 || tenants.length > 0 ? (
                  <Select value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 border-0 shadow-none focus-visible:ring-0">
                    <option value="">Workspace address</option>
                    {senders.map((s) => (
                      <option key={s.email} value={`id:${s.email}`}>{s.display_name ? `${s.display_name} · ${s.email}` : s.email}</option>
                    ))}
                    {tenants.map((t) => (
                      <option key={t.id} value={`st:${t.id}`}>{t.name} · {t.sending_domain}</option>
                    ))}
                  </Select>
                ) : (
                  <span className="flex-1 text-sm">
                    Workspace address{" "}
                    <Link href="/settings/sender" className="text-xs text-muted-foreground underline hover:text-foreground">send from your own address</Link>
                  </span>
                )}
                {from.startsWith("id:") ? <input type="hidden" name="from_email" value={from.slice(3)} /> : null}
                {from.startsWith("st:") ? <input type="hidden" name="sub_tenant_id" value={from.slice(3)} /> : null}
              </div>

              {/* To */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">To</span>
                <input name="to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="ada@example.com"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50" />
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">Subject</span>
                <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50" />
              </div>

              {/* Start from — templates woven into composing */}
              {templates.length > 0 ? (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">Start from</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setStartFrom("")}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", !template ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      Blank
                    </button>
                    {templates.slice(0, 6).map((t) => (
                      <button key={t.slug} type="button" onClick={() => pickTemplate(t.slug)}
                        className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", template?.slug === t.slug ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
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
                      Using the <span className="font-medium text-foreground">{template.name}</span> template — the preview shows its content.
                    </p>
                    {hasPlaceholders ? (
                      <div className="space-y-1.5">
                        <label htmlFor="variables" className="text-sm font-medium">Personalization</label>
                        <Textarea id="variables" name="variables" rows={2} value={varsRaw} onChange={(e) => setVarsRaw(e.target.value)} placeholder={'{"name":"Ada"}'} />
                        <p className="text-xs text-muted-foreground">
                          Fills the template&apos;s <span className="font-mono">{"{{placeholders}}"}</span> — watch the preview update.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <ComposeEditor onHtml={setBodyHtml} onSubject={setSubject} />
                )}
              </div>

              {/* Attachments */}
              {attachments.length > 0 || uploading ? (
                <div className="flex flex-wrap gap-2 px-5 py-3">
                  {attachments.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs">
                      <AttIcon type={a.contentType} />
                      <span className="max-w-[160px] truncate font-medium">{a.filename}</span>
                      <span className="text-muted-foreground">{fmtSize(a.size)}</span>
                      <button type="button" onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))} className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Remove ${a.filename}`}>
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  {uploading ? <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Uploading…</span> : null}
                </div>
              ) : null}
            </div>

            {/* Send bar */}
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <Button type="submit" disabled={pending || uploading}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {pending ? "Sending…" : "Send"}
              </Button>
              <input ref={fileRef} type="file" multiple accept=".pdf,image/png,image/jpeg,image/gif,image/webp,video/mp4" className="hidden" onChange={(e) => onFiles(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <Paperclip className="size-3.5" /> Attach
              </button>
            </div>

            {attachError ? <p className="border-t px-5 py-2 text-xs text-amber-600">{attachError} <span className="text-muted-foreground">Files up to 15MB — for a big video, share a link instead.</span></p> : null}
            {state?.error ? <p className="border-t px-5 py-3 text-sm text-destructive">{state.error}</p> : null}
          </form>
        </CardContent>
      </Card>

      {/* The preview — exactly what lands in their inbox */}
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">What {to || "your recipient"} will see</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-lg border">
            <div className="space-y-0.5 border-b bg-muted/40 px-4 py-2.5 text-xs">
              <p><span className="text-muted-foreground">From:</span> {fromLabel}</p>
              <p><span className="text-muted-foreground">To:</span> {to || "—"}</p>
              <p className="font-medium">{subject || "(no subject)"}</p>
              {attachments.length > 0 ? (
                <p className="flex items-center gap-1 pt-0.5 text-muted-foreground"><Paperclip className="size-3" /> {attachments.length} attachment{attachments.length > 1 ? "s" : ""}</p>
              ) : null}
            </div>
            <iframe title="Email preview" sandbox="" srcDoc={previewHtml} className="h-[420px] w-full bg-white" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
