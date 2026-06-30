"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrgSummary } from "@/lib/types";

const PLANS = ["all", "free", "pro", "scale", "enterprise"] as const;

function planVariant(plan: string): "muted" | "default" | "secondary" {
  if (plan === "free") return "muted";
  if (plan === "enterprise") return "default";
  return "secondary";
}

const PLAN_DOT: Record<string, string> = {
  free: "bg-slate-400",
  pro: "bg-blue-500",
  scale: "bg-violet-500",
  enterprise: "bg-amber-500",
};

export function OrgsTable({ orgs }: { orgs: OrgSummary[] }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<(typeof PLANS)[number]>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs.filter(
      (o) =>
        (plan === "all" || o.plan === plan) &&
        (!needle ||
          o.name.toLowerCase().includes(needle) ||
          o.slug.toLowerCase().includes(needle)),
    );
  }, [orgs, q, plan]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or slug…"
          className="h-9 max-w-xs"
        />
        <div className="flex items-center gap-0.5 rounded-md border p-0.5 text-sm">
          {PLANS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={cn(
                "rounded px-2.5 py-1 capitalize transition-colors",
                plan === p ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {orgs.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Emails (period)</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No matching organizations.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orgs/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{o.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={planVariant(o.plan)} className="gap-1.5 capitalize">
                      <span className={cn("size-1.5 rounded-full", PLAN_DOT[o.plan] ?? "bg-current")} />
                      {o.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{o.members}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(o.usage_this_period)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
