"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { importContacts, importSuppressions } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ImportResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "suppressions" | "contacts";

/** Pragmatic CSV split — handles the simple, comma-separated exports the big
 * providers produce (optionally quoted cells). */
function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

export function ImportPanel({ lists }: { lists: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<Kind>("suppressions");
  const [csv, setCsv] = useState("");
  const [listId, setListId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const entries = useMemo(() => {
    const rows = parseCsv(csv);
    if (rows.length === 0) return [] as { email: string; reason?: string; name?: string }[];
    const first = rows[0].map((c) => c.toLowerCase());
    const hasHeader = first.some((c) => c.includes("email") || c.includes("address"));
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const emailCol = hasHeader ? first.findIndex((c) => c.includes("email") || c.includes("address")) : 0;
    const reasonCol = hasHeader ? first.findIndex((c) => /reason|type|status|event/.test(c)) : -1;
    const nameCol = hasHeader ? first.findIndex((c) => c.includes("name") && !c.includes("email")) : -1;

    const out: { email: string; reason?: string; name?: string }[] = [];
    for (const r of dataRows) {
      const email = (r[emailCol] ?? "").trim();
      if (!email.includes("@")) continue;
      out.push(
        kind === "suppressions"
          ? { email, reason: reasonCol >= 0 ? r[reasonCol] : undefined }
          : { email, name: nameCol >= 0 ? r[nameCol] : undefined },
      );
    }
    return out;
  }, [csv, kind]);

  const run = () => {
    setResult(null);
    setError(null);
    if (entries.length === 0) {
      setError("No email addresses detected — paste a CSV with an email column.");
      return;
    }
    start(async () => {
      const res =
        kind === "suppressions"
          ? await importSuppressions(entries, "import")
          : await importContacts(
              entries.map((e) => ({ email: e.email, name: e.name })),
              listId || undefined,
            );
      if (res.result) setResult(res.result);
      else setError(res.error ?? "Import failed.");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["suppressions", "contacts"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setResult(null);
              setError(null);
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm capitalize",
              kind === k ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {kind === "suppressions"
          ? "Paste your previous provider's suppression export (SendGrid, Postmark, Mailgun…). We detect the email column and map bounce / spam / unsubscribe reasons automatically."
          : "Paste a contacts CSV. We detect the email and name columns. Imports never trigger sequences, so migrated contacts won't be auto-enrolled."}
      </p>

      <Textarea
        rows={8}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={kind === "suppressions" ? "email,reason\njdoe@old.com,bounced\n…" : "email,name\njdoe@old.com,Jane Doe\n…"}
        className="font-mono text-xs"
      />

      {kind === "contacts" && lists.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="list">Add to list (optional)</Label>
          <Select id="list" value={listId} onChange={(e) => setListId(e.target.value)} className="w-64">
            <option value="">— none —</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={run} disabled={pending || entries.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Import {entries.length > 0 ? `${entries.length} row(s)` : ""}
        </Button>
        {entries.length > 0 && !result ? (
          <span className="text-sm text-muted-foreground">{entries.length} email(s) detected</span>
        ) : null}
      </div>

      {result ? (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          Imported <strong>{result.imported}</strong> {result.kind}.
          {result.kind === "suppressions" && result.duplicates ? ` ${result.duplicates} already suppressed.` : ""}
          {result.kind === "contacts" && result.existing ? ` ${result.existing} already existed.` : ""}
          {result.kind === "contacts" && result.added_to_list ? ` ${result.added_to_list} added to the list.` : ""}
          {result.invalid ? ` ${result.invalid} row(s) skipped (invalid email).` : ""}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
