"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  type: "transactional" | "marketing" | "sales" | "any";
  current_version: number;
  updated_at: string;
}

// Transactional and marketing email are different products, so the library reads
// as two shelves: blocks for product email (receipts, resets, notifications) and
// designs for audience email (newsletters, promos). "Any" templates sit on both.
// The default shelf follows the wing you're working in (rm_wing cookie).
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
  any: "Any",
};

function onShelf(t: TemplateRow, shelf: Shelf): boolean {
  if (shelf === "all") return true;
  if (t.type === "any") return true;
  if (shelf === "marketing") return t.type === "marketing" || t.type === "sales";
  return t.type === "transactional";
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
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border p-0.5 text-sm">
        {SHELVES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setShelf(s.id)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              shelf === s.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nothing on this shelf yet — create a template or switch shelves.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/templates/${t.id}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{t.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABEL[t.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">v{t.current_version}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(t.updated_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
