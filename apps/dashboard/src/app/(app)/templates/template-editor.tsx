"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  Code2,
  Loader2,
  Monitor,
  PenLine,
  Save,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { createTemplate, deleteTemplate, updateTemplate, type TemplateFormState } from "./actions";
import { StarterGallery } from "./starter-gallery";
import type { Starter, StarterWing } from "./starters";
import { WritingEditor } from "./writing-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { docToHtml, docToText, emptyDoc, isDoc, type DocNode } from "@/lib/email-doc";
import type { Template, TemplateType } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEW_HTML = `<h1>Hello {{name}} 👋</h1>
<p>Welcome to {{product}} — we're glad you're here.</p>
<p><a href="{{action_url}}">Get started</a></p>`;

const DEVICES = [
  { name: "Desktop", icon: Monitor, width: "100%" },
  { name: "Tablet", icon: Tablet, width: "768px" },
  { name: "Mobile", icon: Smartphone, width: "390px" },
] as const;
type Device = (typeof DEVICES)[number]["name"];

// "What's this for?" — the type in the product's own language, each explaining the
// real consequence (footer/priority) rather than a bare enum. Wings lead.
const TYPES: { id: TemplateType; label: string; desc: string }[] = [
  {
    id: "transactional",
    label: "Transactional",
    desc: "Triggered by something a person did — receipts, password resets, alerts. Sent fast, one recipient, no unsubscribe footer.",
  },
  {
    id: "marketing",
    label: "Marketing",
    desc: "Sent to an audience — newsletters, promos, announcements. The required postal address + unsubscribe footer is added for you.",
  },
  {
    id: "sales",
    label: "Sales",
    desc: "Outreach and follow-ups. Treated like marketing for compliance, so it also gets the unsubscribe footer.",
  },
  {
    id: "any",
    label: "Any",
    desc: "Flexible — appears on both the Transactional and Marketing shelves and can be used anywhere.",
  },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function detectVars(...texts: string[]): string[] {
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  const found = new Set<string>();
  for (const t of texts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) found.add(m[1]);
  }
  return [...found];
}

export function TemplateEditor({ template }: { template?: Template }) {
  const editing = template != null;
  const action = editing ? updateTemplate : createTemplate;
  const [state, formAction, pending] = useActionState<TemplateFormState | null, FormData>(
    action,
    null,
  );

  const initialDoc: DocNode = isDoc(template?.blocks)
    ? (template!.blocks as unknown as DocNode)
    : emptyDoc();
  const [mode, setMode] = useState<"write" | "code">(
    isDoc(template?.blocks) ? "write" : editing ? "code" : "write",
  );
  const [doc, setDoc] = useState<DocNode>(initialDoc);
  // Remount the writing editor when we drop in a new starter (it only seeds from
  // initialDoc on mount), so the chosen layout actually replaces the canvas.
  const [editorKey, setEditorKey] = useState(0);

  // New templates open on the studio gallery; picking a layout reveals the editor.
  const [picked, setPicked] = useState(editing);

  const [name, setName] = useState(template?.name ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(editing);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [type, setType] = useState<TemplateType>(template?.type ?? "transactional");

  const [subject, setSubject] = useState(template?.subject ?? "");
  const [html, setHtml] = useState(template?.html ?? NEW_HTML);
  const [text, setText] = useState(template?.text ?? "");
  const [device, setDevice] = useState<Device>("Desktop");

  // Default the gallery + type to the wing the user is working in (rm_wing cookie).
  const [wing, setWing] = useState<StarterWing>("transactional");
  useEffect(() => {
    const c = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (c === "marketing" || c === "transactional") {
      setWing(c);
      if (!editing) setType(c);
    }
  }, [editing]);

  const deviceWidth = DEVICES.find((d) => d.name === device)?.width ?? "100%";

  const effectiveHtml = useMemo(
    () => (mode === "write" ? docToHtml(doc) : html),
    [mode, doc, html],
  );
  const vars = detectVars(subject, mode === "write" ? docToText(doc) : html, text);
  const activeType = TYPES.find((t) => t.id === type);

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function applyStarter(s: Starter) {
    setDoc(s.doc);
    setSubject(s.subject);
    setType(s.wing);
    if (!name) onName(s.name);
    setMode("write");
    setText("");
    setEditorKey((k) => k + 1);
    setPicked(true);
  }

  function applyBlank(w: StarterWing) {
    setDoc(emptyDoc());
    setSubject("");
    setType(w);
    setMode("write");
    setEditorKey((k) => k + 1);
    setPicked(true);
  }

  // Studio gallery — the entry point for a new template.
  if (!picked) {
    return <StarterGallery key={wing} defaultWing={wing} onPick={applyStarter} onBlank={applyBlank} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="p-6">
          {!editing ? (
            <button
              type="button"
              onClick={() => setPicked(false)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" /> Choose a different layout
            </button>
          ) : null}

          <form action={formAction} className="space-y-5">
            {editing ? <input type="hidden" name="id" value={template.id} /> : null}

            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="Welcome"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>What&apos;s this for?</Label>
              <input type="hidden" name="type" value={type} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    aria-pressed={type === t.id}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      type === t.id
                        ? "border-primary bg-primary/5 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {activeType ? <p className="text-xs text-muted-foreground">{activeType.desc}</p> : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Welcome to {{product}}, {{name}}!"
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Body</Label>
                <div className="flex gap-1 rounded-md border p-0.5 text-sm">
                  <button
                    type="button"
                    onClick={() => setMode("write")}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
                      mode === "write"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <PenLine className="size-3.5" /> Write
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Eject to HTML with the current document rendered out.
                      if (mode === "write") setHtml(docToHtml(doc));
                      setMode("code");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
                      mode === "code"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Code2 className="size-3.5" /> HTML
                  </button>
                </div>
              </div>

              {mode === "write" ? (
                <>
                  <WritingEditor key={editorKey} initialDoc={doc} onChange={setDoc} onSubject={setSubject} />
                  <input type="hidden" name="html" value={effectiveHtml} />
                  <input type="hidden" name="blocks" value={JSON.stringify(doc)} />
                  <p className="text-xs text-muted-foreground">
                    Write naturally and format with the toolbar. Use{" "}
                    <span className="font-mono">{"{{variables}}"}</span> for per-send values.
                  </p>
                </>
              ) : (
                <>
                  <Textarea
                    id="html"
                    name="html"
                    rows={14}
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <input type="hidden" name="blocks" value="" />
                </>
              )}
            </div>

            {/* Developer details — the slug is an API identifier, not a first-run
                concern, so it's auto-generated and tucked away. */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="size-3.5" /> Developer details
              </button>
              <div className={cn("mt-3 space-y-4", !showAdvanced && "hidden")}>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    placeholder="welcome"
                    className="font-mono"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    How you reference this template from the API. Auto-generated from the name — change
                    it only if you send by slug.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="text">Plain-text body (optional)</Label>
                  <Textarea
                    id="text"
                    name="text"
                    rows={4}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="Plain-text fallback for clients that don't render HTML."
                  />
                </div>
              </div>
            </div>

            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {pending ? "Saving…" : editing ? "Save changes" : "Create template"}
              </Button>
              {state?.saved ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <Check className="size-4" /> Saved
                </span>
              ) : null}
            </div>
          </form>

          {editing ? (
            <div className="mt-6 flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Version {template.current_version} · editing the subject or body bumps it.
              </p>
              <DeleteTemplate id={template.id} name={template.name} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Preview</CardTitle>
            <div className="flex gap-1 rounded-md border p-0.5">
              {DEVICES.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => setDevice(d.name)}
                  aria-label={d.name}
                  aria-pressed={device === d.name}
                  title={d.name}
                  className={cn(
                    "rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground",
                    device === d.name && "bg-secondary text-foreground",
                  )}
                >
                  <d.icon className="size-4" />
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{subject || "—"}</span>
            </div>
            <div className="flex justify-center overflow-hidden rounded-md border bg-muted/30 p-3">
              {/* sandbox="" strips scripts — safe to render the draft HTML. */}
              <iframe
                title="Template preview"
                sandbox=""
                srcDoc={effectiveHtml}
                style={{ width: deviceWidth }}
                className="h-[420px] max-w-full rounded-sm border bg-white transition-[width] duration-200"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Variables show as <span className="font-mono">{"{{name}}"}</span> here — they&apos;re
              filled in at send time. Switch device sizes to check responsiveness.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Variables detected</CardTitle>
          </CardHeader>
          <CardContent>
            {vars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. Add <span className="font-mono">{"{{placeholders}}"}</span> to the subject
                or body.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vars.map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono">
                    {v}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeleteTemplate({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteTemplate}
      onSubmit={(e) => {
        if (!confirm(`Delete "${name}"? This can't be undone. Sends already made keep their content.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        <Trash2 className="size-4" /> Delete
      </Button>
    </form>
  );
}
