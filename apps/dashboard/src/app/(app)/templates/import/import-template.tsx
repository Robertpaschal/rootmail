"use client";

import { useActionState, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createTemplate, type TemplateFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Bring a template in from anywhere HTML comes from — an export, an agency
 * file, another provider. SendGrid templates are Handlebars too, so
 * {{placeholders}} keep working as-is. */
export function ImportTemplate() {
  const [state, action, pending] = useActionState<TemplateFormState | null, FormData>(
    createTemplate,
    null,
  );
  const [html, setHtml] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setHtml(content);
      // Sensible defaults from the file itself — all editable before saving.
      const base = f.name.replace(/\.(html?|txt)$/i, "").replace(/[-_]+/g, " ").trim();
      if (!name) {
        const pretty = base.charAt(0).toUpperCase() + base.slice(1);
        setName(pretty);
        if (!slugTouched) setSlug(slugify(pretty));
      }
      if (!subject) {
        const m = /<title[^>]*>([^<]{1,150})<\/title>/i.exec(content);
        if (m) setSubject(m[1].trim());
      }
    };
    reader.readAsText(f);
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          <FileUp className="size-4" />
          <span>
            Drop an <span className="font-medium text-foreground">.html</span> file here or click
            to choose
          </span>
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="html">HTML</Label>
          <Textarea
            id="html"
            name="html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={12}
            placeholder="…or paste the template HTML here"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Handlebars placeholders like <code className="font-mono">{"{{first_name}}"}</code> keep
            working — SendGrid templates use the same syntax.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              placeholder="Launch announcement"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              placeholder="launch-announcement"
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="We just shipped something"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" defaultValue="marketing">
              <option value="marketing">Marketing</option>
              <option value="transactional">Transactional</option>
              <option value="sales">Sales</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !html.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            Import template
          </Button>
          {state?.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Preview</Label>
        {html.trim() ? (
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={html}
            className="h-[480px] w-full rounded-lg border bg-white"
          />
        ) : (
          <div className="flex h-[480px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            The template renders here as you add HTML.
          </div>
        )}
      </div>
    </form>
  );
}
