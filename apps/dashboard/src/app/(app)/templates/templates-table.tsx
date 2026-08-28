"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Band } from "./wireframe";

export interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  type: "transactional" | "marketing" | "sales" | "any";
  subject: string;
  current_version: number;
  updated_at: string;
  /** The template's real structure, read off its stored HTML server-side. */
  bands: Band[];
  blocks: number;
}

/**
 * A SHELF, NOT A TABLE.
 *
 * Transactional and marketing email are different products, so the library
 * still reads as two shelves — that part was right. What was wrong was the
 * object: five sortable columns, identical to the messages table and the
 * contacts table, for a set of things whose whole purpose is that they look
 * like something. Nobody recognises a template by its slug.
 *
 * So each template is a sheet, and the sheet carries its real subject line and
 * a wireframe derived from its real HTML (`wireframe.ts`). The drawing is not
 * decoration and it is not generic: a template with an image band and a button
 * draws an image band and a button, because that is what is in it.
 */

type Shelf = "all" | "transactional" | "marketing";

const SHELVES: { id: Shelf; label: string }[] = [
  { id: "all", label: "All" },
  { id: "transactional", label: "Transactional blocks" },
  { id: "marketing", label: "Marketing designs" },
];

const TYPE_LABEL: Record<TemplateRow["type"], string> = {
  transactional: "Transactional",
  marketing: "Marketing",
  sales: "Sales",
  any: "Any shelf",
};

function onShelf(t: TemplateRow, shelf: Shelf): boolean {
  if (shelf === "all") return true;
  if (t.type === "any") return true;
  if (shelf === "marketing") return t.type === "marketing" || t.type === "sales";
  return t.type === "transactional";
}

/** The silhouette. Ink at low opacity — a wireframe is a description of a
 *  document, not a claim about one, so it never takes a signal colour. */
function Wireframe({ bands }: { bands: Band[] }) {
  if (bands.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="border-b border-dashed border-rule pb-1 font-mono text-[10px] text-muted-foreground">
          no blocks read
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {bands.map((b, i) => {
        if (b.kind === "image")
          return (
            <span
              key={i}
              className="flex h-8 items-center justify-center rounded-sm border border-rule bg-ink/[0.04]"
            >
              <ImageIcon className="size-3 text-ink/25" />
            </span>
          );
        if (b.kind === "rule") return <span key={i} className="my-0.5 h-px bg-rule" />;
        if (b.kind === "button")
          return <span key={i} className="h-3 w-14 rounded-full bg-brass/50" />;
        if (b.kind === "heading")
          return (
            <span
              key={i}
              className={cn(
                "rounded-sm bg-ink/60",
                b.weight === 1 ? "h-2.5 w-3/4" : b.weight === 2 ? "h-2 w-2/3" : "h-1.5 w-1/2",
              )}
            />
          );
        return (
          <span key={i} className="flex flex-col gap-1">
            {Array.from({ length: b.lines }).map((_, k) => (
              <span
                key={k}
                className="h-1 rounded-sm bg-ink/20"
                style={{ width: k === b.lines - 1 ? "62%" : "100%" }}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}

export function TemplatesTable({ templates }: { templates: TemplateRow[] }) {
  const [shelf, setShelf] = useState<Shelf>("all");

  // Land on the shelf matching the wing the user is working in.
  useEffect(() => {
    const wing = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (wing === "marketing" || wing === "transactional") setShelf(wing);
  }, []);

  const rows = useMemo(() => templates.filter((t) => onShelf(t, shelf)), [templates, shelf]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-rule pb-2">
        {SHELVES.map((s) => {
          const n = templates.filter((t) => onShelf(t, s.id)).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setShelf(s.id)}
              className={cn(
                "-mb-2.5 border-b-2 pb-2 text-sm font-medium transition-colors duration-interaction ease-interaction",
                shelf === s.id
                  ? "border-ink text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}{" "}
              <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-rule py-10 text-sm text-muted-foreground">
          Nothing on this shelf yet — create a template or switch shelves.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-rule bg-paper-raised shadow-e1 transition-shadow duration-interaction ease-interaction hover:shadow-e2"
              >
                {/* The sheet. The subject line sits on it where a subject line
                    sits in a mail client — above the body, on the same paper. */}
                <span className="block border-b border-rule px-4 pb-3 pt-4">
                  <span className="block truncate text-sm font-medium leading-snug">
                    {t.subject || <span className="text-muted-foreground">(no subject line)</span>}
                  </span>
                </span>
                <span className="block flex-1 px-4 py-4">
                  <Wireframe bands={t.bands} />
                </span>
                <span className="block border-t border-rule px-4 py-2.5">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] text-muted-foreground" data-fact>
                    <span className="truncate">{t.slug}</span>
                    <span>· v{t.current_version}</span>
                    <span>· {t.blocks} block{t.blocks === 1 ? "" : "s"}</span>
                    <span className="ml-auto shrink-0">{relativeTime(t.updated_at)}</span>
                  </span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {TYPE_LABEL[t.type]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
