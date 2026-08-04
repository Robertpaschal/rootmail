"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { previewAudienceRule, saveAudienceRule } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * An audience that describes itself, built without writing JSON.
 *
 * The rule engine landed first and was usable only from the API, which by our
 * own standard is not a shipped feature — it is a capability nobody can reach.
 * This is the reachable half.
 *
 * The design decision that matters is the COUNT. A rule you cannot see the
 * result of is a rule you cannot trust, and worse, a rule matching nobody looks
 * exactly like a rule that works — right up until the campaign goes out to an
 * empty audience and reports success. So the count is not a nicety here; it is
 * the guard against the failure this feature is most likely to cause. You check
 * before you save, and saving tells you again.
 */

interface Condition {
  field: string;
  op: string;
  value: string;
}

/** Mirrors the fields the evaluator allows. Anything else is rejected server-side. */
const FIELDS = [
  { value: "tag", label: "Tag" },
  { value: "stage", label: "Lifecycle stage" },
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
  { value: "created_at", label: "Added" },
  { value: "updated_at", label: "Last updated" },
  { value: "trait", label: "A trait you sync…" },
] as const;

const OPS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "is set" },
  { value: "not_exists", label: "is not set" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
] as const;

/** Ops that need no value — showing an input for these invites nonsense. */
const NO_VALUE = new Set(["exists", "not_exists"]);
/** Tags are containment, not comparison — the evaluator rejects the rest. */
const TAG_OPS = new Set(["eq", "neq", "contains"]);

const EASE = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };

function toFilter(match: "all" | "any", rows: Condition[], traitKeys: string[]) {
  return {
    match,
    conditions: rows.map((c, i) => ({
      field: c.field === "trait" ? `trait:${traitKeys[i] ?? ""}` : c.field,
      op: c.op,
      ...(NO_VALUE.has(c.op) ? {} : { value: c.value }),
    })),
  };
}

export function AudienceRule({
  listId,
  initialFilter,
  memberCount,
}: {
  listId: string;
  initialFilter: Record<string, unknown> | null;
  memberCount: number;
}) {
  const reduce = useReducedMotion();
  const existing = (initialFilter as { match?: "all" | "any"; conditions?: { field: string; op: string; value?: unknown }[] } | null) ?? null;

  const [open, setOpen] = useState(existing !== null);
  const [match, setMatch] = useState<"all" | "any">(existing?.match ?? "all");
  const [rows, setRows] = useState<Condition[]>(
    existing?.conditions?.map((c) => ({
      field: c.field.startsWith("trait:") ? "trait" : c.field,
      op: c.op,
      value: c.value == null ? "" : String(c.value),
    })) ?? [{ field: "tag", op: "eq", value: "" }],
  );
  const [traitKeys, setTraitKeys] = useState<string[]>(
    existing?.conditions?.map((c) => (c.field.startsWith("trait:") ? c.field.slice(6) : "")) ?? [""],
  );

  const [preview, setPreview] = useState<number | null>(existing ? memberCount : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();

  const patch = (i: number, next: Partial<Condition>) => {
    setRows((r) => r.map((c, j) => (j === i ? { ...c, ...next } : c)));
    setPreview(null); // the number on screen is no longer about this rule
    setSaved(false);
  };
  const addRow = () => {
    setRows((r) => [...r, { field: "tag", op: "eq", value: "" }]);
    setTraitKeys((k) => [...k, ""]);
    setPreview(null);
    setSaved(false);
  };
  const removeRow = (i: number) => {
    setRows((r) => r.filter((_, j) => j !== i));
    setTraitKeys((k) => k.filter((_, j) => j !== i));
    setPreview(null);
    setSaved(false);
  };

  const check = () => {
    setError(null);
    start(async () => {
      const res = await previewAudienceRule(toFilter(match, rows, traitKeys));
      if (res.error) return setError(res.error);
      setPreview(res.size ?? 0);
    });
  };

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveAudienceRule(listId, toFilter(match, rows, traitKeys));
      if (res.error) return setError(res.error);
      setPreview(res.size ?? preview);
      setSaved(true);
    });
  };

  const clear = () => {
    setError(null);
    start(async () => {
      const res = await saveAudienceRule(listId, null);
      if (res.error) return setError(res.error);
      setOpen(false);
      setPreview(null);
      setSaved(false);
    });
  };

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">This audience holds the people you add to it.</p>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
              It can describe itself instead — “everyone on a free plan who never finished setting
              up” — and stay correct on its own as people change.
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
            <Sparkles className="size-4" /> Use a rule
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Everyone who matches</span>
          <Select
            value={match}
            onChange={(e) => {
              setMatch(e.target.value as "all" | "any");
              setPreview(null);
              setSaved(false);
            }}
            className="h-8 w-auto"
            aria-label="Match all or any condition"
          >
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </Select>
        </div>

        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((c, i) => (
              <motion.div
                key={i}
                layout={reduce ? false : "position"}
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={reduce ? { duration: 0 } : EASE}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2"
              >
                <Select
                  value={c.field}
                  onChange={(e) => {
                    const field = e.target.value;
                    // Tags can't use date/existence operators; snap back to a
                    // valid one rather than letting the server reject it later.
                    const op = field === "tag" && !TAG_OPS.has(c.op) ? "eq" : c.op;
                    patch(i, { field, op });
                  }}
                  className="h-8 w-auto min-w-[9rem]"
                  aria-label="Field"
                >
                  {FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>

                {c.field === "trait" ? (
                  <Input
                    value={traitKeys[i] ?? ""}
                    onChange={(e) => {
                      setTraitKeys((k) => k.map((v, j) => (j === i ? e.target.value : v)));
                      setPreview(null);
                      setSaved(false);
                    }}
                    placeholder="trait name, e.g. plan"
                    className="h-8 w-40 font-mono text-xs"
                    aria-label="Trait name"
                  />
                ) : null}

                <Select
                  value={c.op}
                  onChange={(e) => patch(i, { op: e.target.value })}
                  className="h-8 w-auto min-w-[7.5rem]"
                  aria-label="Condition"
                >
                  {OPS.filter((o) => (c.field === "tag" ? TAG_OPS.has(o.value) : true)).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                {NO_VALUE.has(c.op) ? null : (
                  <Input
                    value={c.value}
                    onChange={(e) => patch(i, { value: e.target.value })}
                    placeholder={c.field === "created_at" || c.field === "updated_at" ? "2026-07-01" : "value"}
                    className="h-8 w-40"
                    aria-label="Value"
                  />
                )}

                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="Remove this condition"
                    className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>

          <Button variant="ghost" size="sm" onClick={addRow} className="gap-1.5 text-muted-foreground">
            <Plus className="size-3.5" /> Add a condition
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {/* The count. Not decoration — the check against sending to nobody. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            {busy ? (
              <span className="text-muted-foreground">Counting…</span>
            ) : preview === null ? (
              <span className="text-muted-foreground">Check who this reaches before you save it.</span>
            ) : preview === 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-500">
                This reaches nobody right now — a campaign to it would send nothing.
              </span>
            ) : (
              <span>
                <span className="font-semibold">{preview.toLocaleString()}</span>{" "}
                {preview === 1 ? "person" : "people"} match right now
                {saved ? <span className="text-muted-foreground"> · saved</span> : null}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
              Use a plain list instead
            </Button>
            <Button variant="outline" size="sm" onClick={check} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Check
            </Button>
            <Button size="sm" onClick={save} disabled={busy} className={cn(saved && "opacity-80")}>
              {saved ? "Saved" : "Save rule"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
