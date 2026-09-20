"use client";

import { useActionState, useEffect, useMemo, useState, useTransition} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  ChevronLeft,
  Code2,
  Eye,
  Loader2,
  PenLine,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { createTemplate, deleteTemplate, updateTemplate, type TemplateFormState } from "./actions";
import { StarterGallery } from "./starter-gallery";
import type { BasicLayout, Starter, StarterWing } from "./starters";
import { EmailCanvas, StudioPanel, useEmailEditor, useSelectedBlock } from "./email-studio";
import { MediaLibraryHost } from "./media-library";
import { EmailPreview } from "@/components/app/email-preview";
import { SendTest } from "@/components/app/send-test";
import { StageRail, type Stage } from "@/components/app/stage-rail";
import { sendTestMessage } from "../messages/actions";
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
import { placeholderPerson, suggestedVariables, usedVariables, type PreviewPerson } from "@/lib/sample-vars";
import type { Template, TemplateType, TestRecipient } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEW_HTML = `<h1>Hello {{name}}</h1>
<p>Welcome to {{product}} — we're glad you're here.</p>
<p><a href="{{action_url}}">Get started</a></p>`;

// The type is a CONSEQUENCE, not a question: it decides whether a compliance
// footer is appended and which meter the send counts against. A starter already
// knows its own answer, so we state it and let you change it — never ask first.
const TYPE_FACT: Record<TemplateType, string> = {
  transactional: "Transactional — one-to-one, sent fast, no unsubscribe footer.",
  marketing: "Marketing — bulk send; the postal address + unsubscribe footer is added for you.",
  sales: "Sales — outreach; treated as bulk for compliance, so it gets the unsubscribe footer.",
  any: "General — usable anywhere; appears on both shelves.",
};
const TYPE_LABEL: Record<TemplateType, string> = {
  transactional: "Transactional",
  marketing: "Marketing",
  sales: "Sales",
  any: "General",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const RAIL_KEY = "rm_studio_rail_open";

export function TemplateEditor({
  template,
  testRecipients = [],
  myEmail = null,
  productName = null,
  previewPerson,
  senderLabel = "Your workspace address",
}: {
  template?: Template;
  testRecipients?: TestRecipient[];
  myEmail?: string | null;
  /** The org / product name — fills {{product}} in the preview. */
  productName?: string | null;
  /** A real contact to render the preview as, when the audience has one. */
  previewPerson?: PreviewPerson | null;
  /** How the From line reads, so the preview matches the real send. */
  senderLabel?: string;
}) {
  const editing = template != null;
  const action = editing ? updateTemplate : createTemplate;
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<TemplateFormState | null, FormData>(async (previous, fields) => {
    const snapshot = JSON.stringify(["name", "subject", "slug", "type", "html", "blocks"].map((key) => fields.get(key)));
    const result = await action(previous, fields);
    if (result.saved) setSavedContent(snapshot);
    return result;
  }, null);

  const initialDoc: DocNode = isDoc(template?.blocks) ? (template!.blocks as unknown as DocNode) : emptyDoc();

  const [mode, setMode] = useState<"write" | "code">(
    isDoc(template?.blocks) ? "write" : editing ? "code" : "write",
  );
  const [doc, setDoc] = useState<DocNode>(initialDoc);
  const [theme, setTheme] = useState<EmailTheme>(isDoc(template?.blocks) ? themeOf(initialDoc) : { ...DEFAULT_THEME });

  const editor = useEmailEditor(initialDoc, setDoc);
  const selected = useSelectedBlock(editor);
  const [studioTab, setStudioTab] = useState<"blocks" | "design" | "inspect">("blocks");
  useEffect(() => {
    if (selected?.isAtom) setStudioTab("inspect");
  }, [selected?.pos, selected?.isAtom]);

  // The rail folds to the edge so the email itself is the object on screen —
  // a design tool's canvas should never be the smallest thing in the window.
  const [railOpen, setRailOpen] = useState(true);
  const [wideStudio, setWideStudio] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => { setWideStudio(query.matches); if (query.matches) setMobileToolsOpen(false); };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RAIL_KEY);
      if (stored != null) setRailOpen(stored === "1");
    } catch { /* Editing still works when storage is unavailable. */ }
  }, []);
  const toggleRail = (next: boolean) => {
    setRailOpen(next);
    try { window.localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* Optional preference. */ }
  };

  // --- the journey -----------------------------------------------------------
  // Editing an existing template starts on Design (there's nothing to choose).
  const [phase, setPhase] = useState<0 | 1 | 2>(editing ? 1 : 0);
  const [furthest, setFurthest] = useState<0 | 1 | 2>(editing ? 1 : 0);

  const goto = (next: 0 | 1 | 2) => {
    setPhase(next);
    if (next > furthest) setFurthest(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [name, setName] = useState(template?.name ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(editing);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [type, setType] = useState<TemplateType>(template?.type ?? "transactional");

  const [subject, setSubject] = useState(template?.subject ?? "");
  const [html, setHtml] = useState(template?.html ?? NEW_HTML);

  const [wing, setWing] = useState<StarterWing>("transactional");
  useEffect(() => {
    const c = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (c === "marketing" || c === "transactional") {
      setWing(c);
      if (!editing) setType(c);
    }
  }, [editing]);

  const themedDoc = useMemo(() => withTheme(doc, theme), [doc, theme]);
  const effectiveHtml = useMemo(
    () => (mode === "write" ? docToHtml(themedDoc) : html),
    [mode, themedDoc, html],
  );
  // Derived, never asked for: the plain-text alternative every good sender ships.
  const effectiveText = useMemo(
    () => (mode === "write" ? docToText(themedDoc) : ""),
    [mode, themedDoc],
  );
  // Derived, never asked for: the API identifier.
  const effectiveSlug = slug || slugify(name) || "untitled";

  const person = previewPerson ?? placeholderPerson(myEmail);
  // A DESIGN preview: no recipient exists yet, so filling every placeholder with
  // a plausible value is honest — it answers "does this look right?", which is
  // the only question this stage can answer.
  const variables = useMemo(
    () => suggestedVariables({ product: productName, person }, usedVariables(subject, effectiveHtml)),
    [productName, person, subject, effectiveHtml],
  );

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

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
    setStudioTab("blocks");
    goto(1);
  }

  const applyStarter = (s: Starter) => loadDoc(s.doc, { subject: s.subject, type: s.wing, name: s.name });
  const applyBasic = (b: BasicLayout, w: StarterWing) => loadDoc(b.doc, { type: w, name: b.title });
  const applyBlank = (w: StarterWing) => loadDoc(emptyDoc(), { subject: "", type: w });
  const applyHtml = (w: StarterWing) => {
    setType(w);
    setHtml(NEW_HTML);
    setMode("code");
    goto(1);
  };

  // Editing has nothing to choose, so it doesn't get a "Start" stage at all —
  // the rail should never offer a step that would throw your work away.
  const ALL_STAGES: Stage[] = [
    { id: "start", label: "Choose a starting point" },
    { id: "design", label: "Edit email" },
    {
      id: "review",
      label: "Preview & save",
    },
  ];
  const stages = editing ? ALL_STAGES.slice(1) : ALL_STAGES;
  const railOffset = editing ? 1 : 0;

  const readyToReview = name.trim().length > 0 && subject.trim().length > 0;
  const savedCurrentContent = savedContent === JSON.stringify([name, subject, effectiveSlug, type, effectiveHtml, mode === "write" ? JSON.stringify(themedDoc) : ""]);

  return (
    <form action={formAction} className="template-studio min-w-0 pb-12">
      {editing ? <input type="hidden" name="id" value={template.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="text" value={effectiveText} />
      <input type="hidden" name="html" value={effectiveHtml} />
      <input type="hidden" name="blocks" value={mode === "write" ? JSON.stringify(themedDoc) : ""} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-e1">
      <StageRail
        className="mb-0 min-w-0 flex-1 basis-72"
        stages={stages}
        current={phase - railOffset}
        furthest={furthest - railOffset}
        onJump={(i) => goto((i + railOffset) as 0 | 1 | 2)}
      />
      {phase !== 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="mr-1 text-sm text-muted-foreground">{savedCurrentContent ? "Changes saved" : "Save when you’re ready"}</span>
          {phase === 1 ? (
            <Button type="button" disabled={!readyToReview} onClick={() => goto(2)}>
              <Eye className="size-4" /> Preview & save
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => goto(1)}><PenLine className="size-4" /> Edit email</Button>
              <Button type="submit" aria-busy={pending} disabled={pending || !readyToReview}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {pending ? "Saving…" : editing ? "Save changes" : "Save template"}
              </Button>
            </>
          )}
        </div>
      ) : null}
      </div>
      {state?.error ? <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{state.error}</p> : null}

      <MediaLibraryHost />

      <div>
        {/* ── 1. Start ─────────────────────────────────────────────────── */}
        {phase === 0 ? (
          <div key="start" className="ui-content-enter">
            <StarterGallery key={wing} defaultWing={wing} onPick={applyStarter} onBasic={applyBasic} onBlank={applyBlank} onHtml={applyHtml} />
          </div>
        ) : phase === 1 ? (
          /* ── 2. Design ──────────────────────────────────────────────── */
          <div key="design" className="ui-content-enter">
            <div className="space-y-4">
              <section aria-label="Email details" className="grid gap-4 rounded-2xl border bg-card p-4 shadow-e1 sm:grid-cols-2 xl:grid-cols-[1fr_2fr_12rem]">
                <div className="min-w-0 space-y-2">
                <Label htmlFor="template-name">Template name <span className="font-normal text-muted-foreground">· only you see this</span></Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="Untitled template"
                  aria-label="Template name"
                />
                </div>
                <div className="min-w-0 space-y-2 sm:col-span-2 sm:row-start-2 xl:col-span-1 xl:row-start-auto">
                  <Label htmlFor="template-subject">Subject line <span className="font-normal text-muted-foreground">· appears in the inbox</span></Label>
                  <Input
                    id="template-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What lands in their inbox"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="template-kind">Email type</Label>
                  <select id="template-kind" value={type} onChange={(e) => setType(e.target.value as TemplateType)} aria-describedby="template-type-help" className="min-h-11 w-full rounded-lg border bg-background px-3 text-base">
                    {(Object.keys(TYPE_LABEL) as TemplateType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <p id="template-type-help" className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{TYPE_FACT[type]}</p>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Editor format" className="flex shrink-0 gap-1 rounded-xl border bg-card p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === "code" && html !== docToHtml(themedDoc) && !window.confirm("The visual editor cannot import your HTML edits. Switch to the block draft instead? Your HTML edits will not be included when saving in visual mode.")) return;
                      setMode("write");
                    }}
                    aria-pressed={mode === "write"}
                    className={cn("flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors", mode === "write" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    <PenLine className="size-4" /> Visual editor
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "code"}
                    onClick={() => {
                      if (mode === "write") setHtml(docToHtml(themedDoc));
                      setMode("code");
                    }}
                    className={cn("flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors", mode === "code" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Code2 className="size-4" /> HTML code
                  </button>
                </div>
                {mode === "write" ? wideStudio ? (
                  <Button type="button" variant="outline" aria-expanded={railOpen} aria-controls="studio-panel" onClick={() => toggleRail(!railOpen)}><Blocks className="size-4" /> {railOpen ? "Hide editing tools" : "Show editing tools"}</Button>
                ) : (
                  <Dialog.Root open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
                    <Dialog.Trigger asChild><Button type="button" variant="outline"><Blocks className="size-4" /> Editing tools</Button></Dialog.Trigger>
                    <Dialog.Portal>
                      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
                      <Dialog.Content className="template-studio fixed inset-x-3 top-[5svh] z-50 mx-auto flex max-h-[90svh] max-w-md flex-col rounded-2xl border bg-card p-3 shadow-e3">
                        <div className="mb-3 flex items-start justify-between gap-3 px-1">
                          <div><Dialog.Title className="text-lg font-semibold">Email editing tools</Dialog.Title><Dialog.Description className="mt-1 text-sm text-muted-foreground">Add content, change the email style or edit your selected block.</Dialog.Description></div>
                          <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label="Close editing tools"><X className="size-4" /></Button></Dialog.Close>
                        </div>
                        <div className="min-h-0 overflow-y-auto">
                          <StudioPanel editor={editor} theme={theme} setTheme={setTheme} selected={selected} tab={studioTab} setTab={setStudioTab} onAiSubject={setSubject} />
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                ) : null}
              </div>

              {/* Canvas centre stage; the rail folds to the edge. */}
              {mode === "write" ? (
                <div className={cn("grid items-start gap-4", railOpen && wideStudio && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
                  <div className="min-w-0 space-y-2">
                    <EmailCanvas editor={editor} theme={theme} />
                    <p className="text-xs text-muted-foreground">
                      Click the email to write. Add content with the tools or type <span className="font-mono">/</span>.{" "}
                      <span className="font-mono">{"{{variables}}"}</span> fill in per recipient.
                    </p>
                  </div>

                  {railOpen && wideStudio ? (
                    <aside id="studio-panel" aria-label="Email editing tools" className="min-w-0">
                      <StudioPanel editor={editor} theme={theme} setTheme={setTheme} selected={selected} tab={studioTab} setTab={setStudioTab} onAiSubject={setSubject} />
                    </aside>
                  ) : null}
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base"><Label htmlFor="template-html">Email HTML</Label></CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea id="template-html" rows={22} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-sm" placeholder="<p>Your HTML…</p>" />
                    <p className="text-xs text-muted-foreground">
                      Sent exactly as written. Use <span className="font-mono">{"{{variables}}"}</span> for per-recipient values.
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                {!editing ? (
                  <button type="button" onClick={() => goto(0)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="size-4" /> Change how you start
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Version {state?.version ?? template.current_version} · saving a changed subject or body creates a new version.
                  </p>
                )}
                <div className="flex items-center gap-3">
                  {!readyToReview ? (
                    <span className="text-xs text-muted-foreground">Add a name and a subject to continue</span>
                  ) : null}
                  <Button type="button" disabled={!readyToReview} onClick={() => goto(2)}>
                    <Eye className="size-4" /> Preview it <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── 3. Review & save ────────────────────────────────────────── */
          <div key="review" className="ui-content-enter">
            <div className="space-y-5">
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Preview uses sample values for personalization. Actual appearance can vary by email app. Saving this template does not send an email.</p>
              <EmailPreview
                html={effectiveHtml}
                text={effectiveText}
                subject={subject}
                fromLabel={senderLabel}
                person={person}
                variables={variables}
              />

              {/* Everything we filled in for you, stated plainly. */}
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">Ready to save</p>
                <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="truncate font-medium">{name || "Untitled"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Kind</dt>
                    <dd className="font-medium">{TYPE_LABEL[type]}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Plain-text part</dt>
                    <dd className="font-medium">{effectiveText ? "Generated for you" : "From your HTML"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">API name</dt>
                    <dd className="truncate font-mono text-xs">{effectiveSlug}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{TYPE_FACT[type]}</p>

                {/* Developer details only exist here, and only for those who look. */}
                <div className="mt-3">
                  <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Settings2 className="size-3.5" /> {showAdvanced ? "Hide" : "Change the API name"}
                  </button>
                  {showAdvanced ? (
                    <div className="mt-2 grid max-w-sm gap-1.5">
                      <Label htmlFor="slug-edit" className="text-xs">
                        Slug
                      </Label>
                      <Input
                        id="slug-edit"
                        value={effectiveSlug}
                        onChange={(e) => {
                          setSlug(e.target.value);
                          setSlugEdited(true);
                        }}
                        className="h-8 font-mono text-xs"
                      />
                      <p className="text-[12.5px] text-muted-foreground">How code refers to this template. Generated from the name.</p>
                    </div>
                  ) : null}
                </div>
              </div>


              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => goto(1)}>
                  <ArrowLeft className="size-4" /> Back to editing
                </Button>
                <div className="flex items-center gap-3">
                  {savedCurrentContent ? (
                    <span className="flex items-center gap-1.5 text-sm text-witnessed">
                      <Check className="size-4" /> Saved
                    </span>
                  ) : null}
                  <SendTest
                    recipients={testRecipients}
                    myEmail={myEmail}
                    disabled={pending}
                    onSend={(dest) =>
                      sendTestMessage({ to: dest, subject: subject || name || "Template test", html: effectiveHtml })
                    }
                  />
                  <Button type="submit" aria-busy={pending} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {pending ? "Saving…" : editing ? "Save changes" : "Save template"}
                  </Button>
                </div>
              </div>

              {editing ? (
                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-muted-foreground">Deleting keeps already-sent mail intact.</p>
                  <DeleteTemplate id={template.id} name={template.name} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

function DeleteTemplate({ id, name }: { id: string; name: string }) {
  // Was a submit button with formAction={deleteTemplate} — which can't carry a
  // returned error anywhere, so a refused delete looked exactly like a done one.
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${name}"? This can't be undone. Sends already made keep their content.`)) return;
          start(async () => {
            setError(null);
            const fd = new FormData();
            fd.set("id", id);
            const res = await deleteTemplate(null, fd);
            if (res?.error) setError(res.error);
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
      >
        <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
