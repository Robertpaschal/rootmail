"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Eye, FileText, Film, ImageIcon, Loader2, Paperclip, RefreshCw, Send, X } from "lucide-react";
import { lookupRecipient, sendMessage, sendTestMessage, uploadAttachmentAction, type SendState } from "../actions";
import { SendTest } from "@/components/app/send-test";
import { EmailPreview } from "@/components/app/email-preview";
import { StageRail, StageScene, type Stage } from "@/components/app/stage-rail";
import {
  certainVariables,
  missingVariables,
  placeholderPerson,
  suggestFor,
  usedVariables,
  type PreviewPerson,
} from "@/lib/sample-vars";
import { ComposeEditor } from "./compose-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { SubTenant, TestRecipient } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ComposeTemplate {
  slug: string;
  name: string;
  subject: string;
  html: string;
  /** Template category: transactional | marketing | sales | any (general). */
  type: string;
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
  testRecipients = [],
  myEmail = null,
  productName = null,
}: {
  tenants: SubTenant[];
  templates: ComposeTemplate[];
  senders: { email: string; display_name: string | null }[];
  initialTo?: string;
  initialSubject?: string;
  /** Reserved addresses that force a known delivery outcome (real path). */
  testRecipients?: TestRecipient[];
  /** The signed-in user's own address — the "send it to me" destination. */
  myEmail?: string | null;
  /** The org / product name — fills {{product}} in the preview. */
  productName?: string | null;
}) {
  const [state, formAction, pending] = useActionState<SendState | null, FormData>(sendMessage, null);
  const router = useRouter();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [startFrom, setStartFrom] = useState(""); // "" = blank, else template slug
  const [category, setCategory] = useState(""); // "" = all; else template type
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

  // Write → Review. The preview is worth a whole scene: it's the last moment
  // before a real person receives this.
  const [phase, setPhase] = useState<0 | 1>(0);
  const [dir, setDir] = useState(1);
  const [person, setPerson] = useState<PreviewPerson | null>(null);
  const [resolving, startResolve] = useTransition();
  // Values for the {{variables}} we genuinely can't know. Asked for ONLY here,
  // one plain field each, and only when the draft actually contains one.
  const [blanks, setBlanks] = useState<Record<string, string>>({});

  const goReview = () => {
    setDir(1);
    startResolve(async () => {
      const r = await lookupRecipient(to);
      setPerson({ email: r.email, name: r.name, extra: r.extra, real: r.real });
      setPhase(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  const goWrite = () => {
    setDir(-1);
    setPhase(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const template = templates.find((t) => t.slug === startFrom) ?? null;
  const hasPlaceholders = template ? /\{\{\s*\w+\s*\}\}/.test(template.html + template.subject) : false;

  // Category-filtered template options; "General" (type any) templates show in
  // every specific category too, since they're usable anywhere. The currently
  // selected template always stays listed so the picker never looks empty-handed.
  const categoryTemplates = useMemo(() => {
    const filtered =
      category === ""
        ? templates
        : templates.filter((t) => t.type === category || (category !== "any" && t.type === "any"));
    if (template && !filtered.some((t) => t.slug === template.slug)) return [template, ...filtered];
    return filtered;
  }, [templates, category, template]);

  const pickTemplate = (slug: string) => {
    setStartFrom(slug);
    const t = templates.find((x) => x.slug === slug);
    if (t && t.subject) setSubject(t.subject);
  };

  const composedHtml = PREVIEW_WRAP_START + (bodyHtml || "<p></p>") + "</div>";

  // The raw source that will be rendered for this recipient.
  const sourceHtml = template ? template.html : composedHtml;
  const sourceSubject = template && !subject ? template.subject : subject;

  const previewPerson = person ?? placeholderPerson(to || myEmail);

  // What the send path will REALLY substitute for this person. Anything a
  // template asks for beyond this is a genuine gap — and the preview must show
  // it as a gap rather than invent something the recipient will never see.
  const certain = useMemo(() => certainVariables(previewPerson), [previewPerson]);

  // Everything the draft asks for that we can't promise. Asked for once, in
  // plain words, with our best guess already typed in — so the value the sender
  // confirms is the value that actually travels with the send.
  const unknowns = useMemo(
    () => usedVariables(sourceSubject, sourceHtml).filter((k) => certain[k] == null || certain[k] === ""),
    [sourceSubject, sourceHtml, certain],
  );
  // Seed each blank with a suggestion the first time we meet it.
  useEffect(() => {
    setBlanks((b) => {
      let changed = false;
      const next = { ...b };
      for (const k of unknowns) {
        if (next[k] === undefined) {
          next[k] = suggestFor(k, { product: productName });
          changed = true;
        }
      }
      return changed ? next : b;
    });
  }, [unknowns, productName]);

  const previewVars = useMemo(() => {
    const filled = Object.fromEntries(Object.entries(blanks).filter(([, v]) => v.trim() !== ""));
    return { ...certain, ...filled };
  }, [certain, blanks]);

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

  const stages: Stage[] = [
    { id: "write", label: "Write", hint: "Who it's for and what it says. Nothing is sent yet." },
    {
      id: "review",
      label: "Review & send",
      hint: "The exact email this person receives, with their details filled in.",
    },
  ];

  return (
    <div className="pb-24">
      <StageRail stages={stages} current={phase} furthest={phase} onJump={(i) => (i === 0 ? goWrite() : goReview())} />

      <form action={formAction}>
        {/* Internalized: a generated idempotency key (no field to fill). */}
        <input type="hidden" name="idempotency_key" value={idemKey} />
        <input type="hidden" name="attachments" value={JSON.stringify(attachments.map((a) => a.id))} />
        {!template ? <input type="hidden" name="html" value={composedHtml} /> : null}
        {/* Hoisted out of the Write scene: that scene unmounts on Review, and a
            named input inside it would drop out of the submission with it. */}
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="subject" value={sourceSubject} />
        {template ? <input type="hidden" name="template" value={template.slug} /> : null}
        {from.startsWith("id:") ? <input type="hidden" name="from_email" value={from.slice(3)} /> : null}
        {from.startsWith("st:") ? <input type="hidden" name="sub_tenant_id" value={from.slice(3)} /> : null}
        {/* Everything the sender filled in for the blanks travels as variables. */}
        <input
          type="hidden"
          name="variables"
          value={JSON.stringify(Object.fromEntries(Object.entries(blanks).filter(([, v]) => v.trim() !== "")))}
        />

        <AnimatePresence mode="wait" initial={false}>
        {phase === 0 ? (
        <StageScene keyId="write" direction={dir}>
      <Card>
        <CardContent className="p-0">
          <div>
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
              </div>

              {/* To */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">To</span>
                <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="ada@example.com"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50" />
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">Subject</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?"
                  className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50" />
              </div>

              {/* Start from — pick a category, then a template; or jump to the
                  studio (new tab) to design the one that's missing and refresh. */}
              <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                <span className="w-16 shrink-0 text-sm text-muted-foreground">Start from</span>
                <button type="button" onClick={() => setStartFrom("")}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", !template ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  Blank
                </button>
                {templates.length > 0 ? (
                  <>
                    <Select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="h-8 w-auto text-xs"
                      aria-label="Template category"
                    >
                      <option value="">All categories</option>
                      <option value="transactional">Transactional</option>
                      <option value="marketing">Marketing</option>
                      <option value="sales">Sales</option>
                      <option value="any">General</option>
                    </Select>
                    <Select
                      value={template?.slug ?? ""}
                      onChange={(e) => (e.target.value ? pickTemplate(e.target.value) : setStartFrom(""))}
                      className="h-8 w-auto min-w-44 max-w-72 text-xs"
                      aria-label="Template"
                    >
                      <option value="">Pick a template…</option>
                      {categoryTemplates.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No templates yet —</span>
                )}
                <Link
                  href="/templates/new"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  New template <ExternalLink className="size-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  title="Refresh templates (after designing one in the studio)"
                  className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                {template ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Using the <span className="font-medium text-foreground">{template.name}</span> template — the preview shows its content.
                    </p>
                    {hasPlaceholders ? (
                      <p className="text-xs text-muted-foreground">
                        Its <span className="font-mono">{"{{placeholders}}"}</span> fill in from this person&apos;s contact record.
                        Anything we can&apos;t know, you&apos;ll be asked for once — on the next step, next to the preview.
                      </p>
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

            {/* The internal type never needs choosing: a composed email to one
                person IS a one-to-one (transactional) send. Say so quietly. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
              <div className="flex items-center gap-4">
                <input ref={fileRef} type="file" multiple accept=".pdf,image/png,image/jpeg,image/gif,image/webp,video/mp4" className="hidden" onChange={(e) => onFiles(e.target.files)} />
                <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <Paperclip className="size-3.5" /> Attach
                </button>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  One-to-one email · uses your transactional sends
                </span>
              </div>
              <Button type="button" disabled={!to.trim() || uploading || resolving} onClick={goReview}>
                {resolving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                See what they get <ArrowRight className="size-4" />
              </Button>
            </div>

            {attachError ? <p className="border-t px-5 py-2 text-xs text-amber-600">{attachError} <span className="text-muted-foreground">Files up to 15MB — for a big video, share a link instead.</span></p> : null}
          </div>
        </CardContent>
      </Card>
        </StageScene>
        ) : (

        <StageScene keyId="review" direction={dir}>
          <div className="space-y-5">
            {/* Only what we genuinely can't know — one plain field each, and the
                preview updates as you type. No JSON, no "detected variables". */}
            {unknowns.length > 0 ? (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div>
                    <p className="text-sm font-semibold">Fill in the blanks</p>
                    <p className="text-xs text-muted-foreground">
                      Everything else came from {previewPerson.real ? "their contact record" : "your account"}. These are the
                      only pieces we can&apos;t know.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {unknowns.map((v) => (
                      <label key={v} className="grid gap-1.5">
                        <span className="text-xs font-medium capitalize">{v.replace(/_/g, " ")}</span>
                        <input
                          value={blanks[v] ?? ""}
                          onChange={(e) => setBlanks((b) => ({ ...b, [v]: e.target.value }))}
                          placeholder={`Value for {{${v}}}`}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <EmailPreview
              html={sourceHtml}
              subject={sourceSubject}
              fromLabel={fromLabel}
              person={previewPerson}
              variables={previewVars}
            />

            {attachments.length > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" /> {attachments.length} attachment{attachments.length > 1 ? "s" : ""} ride along:{" "}
                {attachments.map((a) => a.filename).join(", ")}
              </p>
            ) : null}

            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button type="button" variant="ghost" onClick={goWrite}>
                <ArrowLeft className="size-4" /> Back to writing
              </Button>
              <div className="flex items-center gap-3">
                {/* Prove it before a person gets it — same path, safe destination. */}
                <SendTest
                  recipients={testRecipients}
                  myEmail={myEmail}
                  openUp
                  disabled={pending || uploading}
                  onSend={(dest) =>
                    sendTestMessage({
                      to: dest,
                      subject: sourceSubject,
                      html: bodyHtml,
                      template: startFrom || undefined,
                      from_email: senders[0]?.email,
                    })
                  }
                />
                <Button type="submit" disabled={pending || uploading}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {pending ? "Sending…" : `Send to ${previewPerson.name ?? to}`}
                </Button>
              </div>
            </div>
          </div>
        </StageScene>
        )}
        </AnimatePresence>
      </form>
    </div>
  );
}
