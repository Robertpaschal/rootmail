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
import type { BasicLayout, Starter, StarterWing } from "./starters";
import { EmailCanvas, StudioPanel, useEmailEditor, useSelectedBlock } from "./email-studio";
import { MediaLibraryHost } from "./media-library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_THEME,
  docToHtml,
  docToText,
  emptyDoc,
  isDoc,
  themeOf,
  withTheme,
  type DocNode,
  type EmailTheme,
} from "@/lib/email-doc";
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
  const [state, formAction, pending] = useActionState<TemplateFormState | null, FormData>(action, null);

  const initialDoc: DocNode = isDoc(template?.blocks) ? (template!.blocks as unknown as DocNode) : emptyDoc();

  const [mode, setMode] = useState<"write" | "code">(
    isDoc(template?.blocks) ? "write" : editing ? "code" : "write",
  );
  const [doc, setDoc] = useState<DocNode>(initialDoc);
  const [theme, setTheme] = useState<EmailTheme>(isDoc(template?.blocks) ? themeOf(initialDoc) : { ...DEFAULT_THEME });

  // The studio editor is owned here so the palette/inspector can act on it.
  const editor = useEmailEditor(initialDoc, setDoc);
  const selected = useSelectedBlock(editor);
  const [studioTab, setStudioTab] = useState<"blocks" | "design" | "inspect">("blocks");
  // Clicking a block in the canvas jumps the panel to its settings.
  useEffect(() => {
    if (selected?.isAtom) setStudioTab("inspect");
  }, [selected?.pos, selected?.isAtom]);

  // New templates open on the launcher; picking a path reveals the studio.
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

  // Default the launcher + type to the wing the user is working in (rm_wing cookie).
  const [wing, setWing] = useState<StarterWing>("transactional");
  useEffect(() => {
    const c = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (c === "marketing" || c === "transactional") {
      setWing(c);
      if (!editing) setType(c);
    }
  }, [editing]);

  const deviceWidth = DEVICES.find((d) => d.name === device)?.width ?? "100%";

  const themedDoc = useMemo(() => withTheme(doc, theme), [doc, theme]);
  const effectiveHtml = useMemo(
    () => (mode === "write" ? docToHtml(themedDoc) : html),
    [mode, themedDoc, html],
  );
  const vars = detectVars(subject, mode === "write" ? docToText(doc) : html, text);
  const activeType = TYPES.find((t) => t.id === type);

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  // Load a document into the studio and reveal it.
  function loadDoc(next: DocNode, opts: { subject?: string; type?: TemplateType; name?: string; theme?: EmailTheme }) {
    if (editor) {
      editor.commands.setContent(next);
      setDoc(editor.getJSON() as DocNode);
    } else {
      setDoc(next);
    }
    setTheme(opts.theme ?? { ...DEFAULT_THEME });
    if (opts.subject !== undefined) setSubject(opts.subject);
    if (opts.type) setType(opts.type);
    if (opts.name && !name) onName(opts.name);
    setMode("write");
    setText("");
    setStudioTab("blocks");
    setPicked(true);
  }

  const applyStarter = (s: Starter) => loadDoc(s.doc, { subject: s.subject, type: s.wing, name: s.name });
  const applyBasic = (b: BasicLayout, w: StarterWing) => loadDoc(b.doc, { type: w, name: b.title });
  const applyBlank = (w: StarterWing) => loadDoc(emptyDoc(), { subject: "", type: w });
  const applyHtml = (w: StarterWing) => {
    setType(w);
    setHtml(NEW_HTML);
    setMode("code");
    setPicked(true);
  };

  const previewCard = () => (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Preview</CardTitle>
        <div className="flex gap-1 rounded-md border p-0.5">
          {DEVICES.map((d) => (
            <button key={d.name} type="button" onClick={() => setDevice(d.name)} aria-label={d.name} aria-pressed={device === d.name} title={d.name}
              className={cn("rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground", device === d.name && "bg-secondary text-foreground")}>
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
          <iframe title="Template preview" sandbox="" srcDoc={effectiveHtml} style={{ width: deviceWidth }} className="h-[420px] max-w-full rounded-sm border bg-white transition-[width] duration-200" />
        </div>
        <p className="text-xs text-muted-foreground">
          Variables show as <span className="font-mono">{"{{name}}"}</span> here — they&apos;re filled in at send time.
        </p>
      </CardContent>
    </Card>
  );

  const variablesCard = () => (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Variables detected</CardTitle></CardHeader>
      <CardContent>
        {vars.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Add <span className="font-mono">{"{{placeholders}}"}</span> to the subject or body.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {vars.map((v) => (
              <Badge key={v} variant="secondary" className="font-mono">{v}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Launcher — the entry point for a new template.
  if (!picked) {
    return <StarterGallery key={wing} defaultWing={wing} onPick={applyStarter} onBasic={applyBasic} onBlank={applyBlank} onHtml={applyHtml} />;
  }

  return (
    <form action={formAction} className="space-y-5">
      {editing ? <input type="hidden" name="id" value={template.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="html" value={effectiveHtml} />
      <input type="hidden" name="blocks" value={mode === "write" ? JSON.stringify(themedDoc) : ""} />

      {/* Meta bar — the essentials, always visible above the studio. */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            {!editing ? (
              <button type="button" onClick={() => setPicked(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-4" /> Change how you start
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Version {template.current_version} · editing the subject or body bumps it.</p>
            )}
            <div className="flex items-center gap-3">
              {state?.saved ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600"><Check className="size-4" /> Saved</span>
              ) : null}
              <Button type="submit" disabled={pending} size="sm">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {pending ? "Saving…" : editing ? "Save changes" : "Create template"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" value={name} onChange={(e) => onName(e.target.value)} placeholder="Welcome" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="subject">Subject line</Label>
              <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Welcome to {{product}}, {{name}}!" required />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-1.5">
              <Label>What&apos;s this for?</Label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setType(t.id)} aria-pressed={type === t.id}
                    className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", type === t.id ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Write (studio) vs HTML — HTML stays for those who want to hand-code. */}
            <div className="flex gap-1 self-start rounded-md border p-0.5 text-sm sm:self-end">
              <button type="button" onClick={() => setMode("write")}
                className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors", mode === "write" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <PenLine className="size-3.5" /> Design
              </button>
              <button type="button" onClick={() => { if (mode === "write") setHtml(docToHtml(themedDoc)); setMode("code"); }}
                className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors", mode === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Code2 className="size-3.5" /> HTML
              </button>
            </div>
          </div>
          {activeType ? <p className="text-xs text-muted-foreground">{activeType.desc}</p> : null}
        </CardContent>
      </Card>

      {/* Media library modal — serves every "pick an image" flow in the studio. */}
      <MediaLibraryHost />

      {/* The studio: canvas + right rail (Blocks / Design / Inspect + preview). */}
      {mode === "write" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-2">
            <EmailCanvas editor={editor} theme={theme} />
            <p className="text-xs text-muted-foreground">
              Click any block to edit it in <span className="font-medium">Inspect</span>. Type <span className="font-mono">/</span> for a quick block menu. Use{" "}
              <span className="font-mono">{"{{variables}}"}</span> for per-send values.
            </p>
          </div>
          <div className="space-y-5">
            <StudioPanel editor={editor} theme={theme} setTheme={setTheme} selected={selected} tab={studioTab} setTab={setStudioTab} onAiSubject={setSubject} />
            {previewCard()}
            {variablesCard()}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">HTML</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea id="html-src" rows={20} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-xs" placeholder="<p>Your HTML…</p>" />
              <p className="text-xs text-muted-foreground">Sent exactly as written. Use <span className="font-mono">{"{{variables}}"}</span> for per-send values.</p>
            </CardContent>
          </Card>
          <div className="space-y-5">
            {previewCard()}
            {variablesCard()}
          </div>
        </div>
      )}

      {/* Developer details — the slug is an API identifier, tucked away. */}
      <div>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Settings2 className="size-3.5" /> Developer details
        </button>
        <div className={cn("mt-3 grid gap-4 md:grid-cols-2", !showAdvanced && "hidden")}>
          <div className="grid gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" name="slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} placeholder="welcome" className="font-mono" required />
            <p className="text-xs text-muted-foreground">How you reference this template from the API. Auto-generated from the name.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="text">Plain-text body (optional)</Label>
            <Textarea id="text" name="text" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder="Plain-text fallback for clients that don't render HTML." />
          </div>
        </div>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      {editing ? (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">Deleting keeps already-sent mail intact.</p>
          <DeleteTemplate id={template.id} name={template.name} />
        </div>
      ) : null}
    </form>
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
