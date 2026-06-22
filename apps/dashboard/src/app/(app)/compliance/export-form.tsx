"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { generateComplianceExport } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExportForm() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    if (!from) {
      setError("Pick a start date.");
      return;
    }
    start(async () => {
      const res = await generateComplianceExport(from, to);
      if (res.data) {
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename ?? "compliance-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError(res.error ?? "Failed to generate the export.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Generate signed export
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave “To” empty to export up to now. Up to 5,000 messages per export — narrow the range for larger
        histories.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
