"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { importSuppressionsAction } from "./actions";
import { extractEntries } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ImportResult } from "@/lib/types";

/**
 * Import a previous provider's suppression list — the "don't email these
 * addresses" memory that protects your reputation when you migrate. Owns its
 * reveal; `defaultOpen` lets ?import=suppressions deep-link it open.
 */
export function SuppressionsImport({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const entries = useMemo(() => extractEntries(csv, "suppressions"), [csv]);

  const run = () => {
    setResult(null);
    setError(null);
    if (entries.length === 0) return void setError("No email addresses detected — paste a CSV with an email column.");
    start(async () => {
      const res = await importSuppressionsAction(entries.map((e) => ({ email: e.email, reason: e.reason })));
      if (res.error) return void setError(res.error);
      setResult(res.result ?? null);
      setCsv("");
      setFileName(null);
      router.refresh();
    });
  };

  return (
    <div id="suppressions">
      <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
        {open ? <X className="size-4" /> : <ShieldCheck className="size-4" />}
        {open ? "Close" : "Import suppressions"}
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">
                Moving from another provider? Bring their suppression export (SendGrid, Postmark, Mailgun…) so
                you never re-email an address that already bounced, complained, or unsubscribed. We detect the
                email column and map reasons automatically.
              </p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                <Upload className="size-4" />
                {fileName ? (
                  <span><span className="font-medium text-foreground">{fileName}</span> loaded — review below, or choose another file</span>
                ) : (
                  <span>Drop the <span className="font-medium text-foreground">.csv</span> here or click to choose a file</span>
                )}
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setCsv(String(reader.result ?? ""));
                      setFileName(f.name);
                      setResult(null);
                      setError(null);
                    };
                    reader.readAsText(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <Textarea
                rows={5}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"email,reason\njdoe@old.com,bounced\n…"}
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-3">
                <Button type="button" onClick={run} disabled={pending || entries.length === 0}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                  Import{entries.length > 0 ? ` ${entries.length} address${entries.length === 1 ? "" : "es"}` : ""}
                </Button>
              </div>
              {result ? (
                <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Imported <strong>{result.imported}</strong> suppressions.
                  {result.duplicates ? ` ${result.duplicates} already suppressed.` : ""}
                  {result.invalid ? ` ${result.invalid} row(s) skipped (invalid email).` : ""}
                </div>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
