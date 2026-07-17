"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp, Loader2, Plus, Upload, UserPlus, X } from "lucide-react";
import { importContactsAction, upsertContact, type UpsertState } from "./actions";
import { extractEntries } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ImportResult } from "@/lib/types";

type Mode = "one" | "import";

/**
 * The single "Add people" flow for the Audience hub: add one person by hand, or
 * import a file — and optionally drop the imports straight into an audience
 * (existing or named-on-the-spot). Owns its own reveal: a right-aligned trigger
 * row and a full-width panel beneath.
 */
export function AddPeople({
  lists,
  defaultMode = "one",
  defaultOpen = false,
}: {
  lists: { id: string; name: string }[];
  defaultMode?: Mode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>(defaultMode);

  return (
    <div>
      <div className="flex justify-end">
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
          {open ? "Close" : "Add people"}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border bg-muted/20 p-4">
              <div className="mb-4 flex gap-2">
                {(
                  [
                    { id: "one", label: "One person", icon: UserPlus },
                    { id: "import", label: "Import a file", icon: FileUp },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      mode === m.id ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <m.icon className="size-4" /> {m.label}
                  </button>
                ))}
              </div>
              {mode === "one" ? <AddOnePerson /> : <ImportPeople lists={lists} />}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AddOnePerson() {
  const [state, formAction, pending] = useActionState<UpsertState | null, FormData>(upsertContact, null);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="c-email">Email</Label>
        <Input id="c-email" name="email" type="email" placeholder="ada@example.com" required autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-name">Name (optional)</Label>
        <Input id="c-name" name="name" placeholder="Ada Lovelace" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-phone">Phone (optional)</Label>
        <Input id="c-phone" name="phone" placeholder="+1 555 0100" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-tags">Tags (optional)</Label>
        <Input id="c-tags" name="tags" placeholder="vip, beta" className="font-mono" />
      </div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs text-muted-foreground">
          Tags are how you slice people into subsets — “vip”, “trial”, “beta” — and target them in campaigns.
          Adding an email that already exists updates that person.
        </p>
        {state?.error ? <p className="mb-2 text-sm text-destructive">{state.error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {pending ? "Saving…" : "Add person"}
        </Button>
      </div>
    </form>
  );
}

function ImportPeople({ lists }: { lists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // "" = no audience · "new" = create one with the name below · else a list id
  const [dest, setDest] = useState("");
  const [newName, setNewName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const entries = useMemo(() => extractEntries(csv, "contacts"), [csv]);

  const run = () => {
    setResult(null);
    setError(null);
    if (entries.length === 0) return void setError("No email addresses detected — paste a CSV with an email column.");
    if (dest === "new" && !newName.trim()) return void setError("Name the new audience, or choose “no audience”.");
    start(async () => {
      const res = await importContactsAction(
        entries.map((e) => ({ email: e.email, name: e.name })),
        dest === "new" ? { newAudienceName: newName } : { listId: dest || undefined },
      );
      if (res.error) return void setError(res.error);
      setResult(res.result ?? null);
      setCsv("");
      setFileName(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste or upload a CSV from your old provider — we find the email and name columns automatically.
        Imports never auto-enroll anyone in sequences.
      </p>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
        <Upload className="size-4" />
        {fileName ? (
          <span><span className="font-medium text-foreground">{fileName}</span> loaded — review below, or choose another file</span>
        ) : (
          <span>Drop your <span className="font-medium text-foreground">.csv</span> here or click to choose a file</span>
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
        rows={6}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={"email,name\njdoe@old.com,Jane Doe\n…"}
        className="font-mono text-xs"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="dest">Put them in an audience?</Label>
          <Select id="dest" value={dest} onChange={(e) => setDest(e.target.value)} className="w-56">
            <option value="">Not yet — just add them</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
            <option value="new">＋ A new audience…</option>
          </Select>
        </div>
        {dest === "new" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="new-name">New audience name</Label>
            <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Newsletter subscribers" className="w-56" />
          </div>
        ) : null}
        <Button type="button" onClick={run} disabled={pending || entries.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          Import{entries.length > 0 ? ` ${entries.length} ${entries.length === 1 ? "person" : "people"}` : ""}
        </Button>
      </div>

      {result ? (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          Imported <strong>{result.imported}</strong> {result.imported === 1 ? "person" : "people"}.
          {result.existing ? ` ${result.existing} already existed.` : ""}
          {result.added_to_list ? ` ${result.added_to_list} added to the audience.` : ""}
          {result.invalid ? ` ${result.invalid} row(s) skipped (invalid email).` : ""}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
