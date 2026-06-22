"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { setRetentionPolicy } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RetentionPolicy } from "@/lib/types";

const WINDOWS = [
  { v: "", label: "Off — keep forever" },
  { v: "30", label: "30 days" },
  { v: "90", label: "90 days" },
  { v: "180", label: "180 days" },
  { v: "365", label: "1 year" },
  { v: "730", label: "2 years" },
];

export function RetentionForm({ policy }: { policy: RetentionPolicy }) {
  const [days, setDays] = useState(policy.retention_days ? String(policy.retention_days) : "");
  const [mode, setMode] = useState<"redact" | "delete">(policy.retention_mode);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await setRetentionPolicy(days ? Number(days) : null, mode);
      if (res.ok) {
        setMsg(
          days
            ? `Saved. ${res.affected} message(s) are already past this window and will be ${mode === "delete" ? "deleted" : "redacted"} on the next daily sweep.`
            : "Retention disabled — messages are kept indefinitely.",
        );
      } else {
        setErr(res.error ?? "Could not save.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="window">Retention window</Label>
          <Select id="window" value={days} onChange={(e) => setDays(e.target.value)} className="w-52">
            {WINDOWS.map((w) => (
              <option key={w.v} value={w.v}>
                {w.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mode">When expired</Label>
          <Select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "redact" | "delete")}
            disabled={!days}
            className="w-52"
          >
            <option value="redact">Redact (keep proof, strip PII)</option>
            <option value="delete">Delete (remove entirely)</option>
          </Select>
        </div>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save policy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong>Redact</strong> keeps each message&apos;s id, content hash, status and audit trail (so it stays
        provable) but clears recipient, subject and body. <strong>Delete</strong> removes the message and its
        audit entirely. Enforced daily; applies to messages older than the window.
      </p>
      {policy.retention_days ? (
        <p className="text-sm text-muted-foreground">
          Currently <span className="font-medium text-foreground">{policy.affected_now}</span> message(s) are past
          the active {policy.retention_days}-day window.
        </p>
      ) : null}
      {msg ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}
