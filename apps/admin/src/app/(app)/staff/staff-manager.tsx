"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, UserPlus, X } from "lucide-react";
import {
  createStaffAction,
  deactivateStaffAction,
  reactivateStaffAction,
  resetStaffPasswordAction,
  setStaffRoleAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { StaffRole, StaffUser } from "@/lib/types";

const ROLES: StaffRole[] = ["superadmin", "billing", "support", "readonly"];

// Role reads at a glance: authority = violet, money = green, care = blue, view = slate.
const ROLE_BADGE: Record<StaffRole, string> = {
  superadmin: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  billing: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  support: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  readonly: "bg-muted text-muted-foreground",
};

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ROLE_BADGE[role])}>
      {role}
    </span>
  );
}

function initials(s: StaffUser): string {
  const src = s.name?.trim() || s.email;
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** The team directory: members presented as people (avatar, name, role), with
 * managing — add, role change, reset, deactivate — as deliberate actions, not a
 * form that greets you. */
export function StaffManager({
  staff,
  canManage,
  currentId,
}: {
  staff: StaffUser[];
  canManage: boolean;
  currentId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("support");
  const [notice, setNotice] = useState<{ kind: "secret" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ error?: string; data?: unknown }>, onOk?: (data: unknown) => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) setNotice({ kind: "error", text: res.error });
      else onOk?.(res.data);
    });

  const create = () =>
    act(
      () => createStaffAction({ email, name, role }),
      (data) => {
        const pw = (data as { generated_password?: string } | undefined)?.generated_password;
        setEmail("");
        setName("");
        setAdding(false);
        setNotice(pw ? { kind: "secret", text: `Created. One-time password (copy now): ${pw}` } : { kind: "secret", text: "Staff member created." });
      },
    );

  const resetPw = (id: string, who: string) =>
    act(
      () => resetStaffPasswordAction(id),
      (data) => {
        const pw = (data as { generated_password?: string } | undefined)?.generated_password;
        setNotice({ kind: "secret", text: `New one-time password for ${who} (copy now): ${pw}` });
      },
    );

  const active = staff.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className={
            notice.kind === "secret"
              ? "rounded-lg border border-amber-500/40 bg-amber-50 p-3 font-mono text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "rounded-lg border border-red-500/40 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }
        >
          {notice.text}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Team
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {staff.length} member{staff.length === 1 ? "" : "s"} · {active} active
            </span>
          </CardTitle>
          {canManage ? (
            <Button type="button" variant={adding ? "ghost" : "default"} size="sm" onClick={() => setAdding((v) => !v)}>
              {adding ? (
                <>
                  <X className="size-4" /> Cancel
                </>
              ) : (
                <>
                  <UserPlus className="size-4" /> Add member
                </>
              )}
            </Button>
          ) : null}
        </CardHeader>

        {adding && canManage ? (
          <CardContent className="border-b pb-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">Email</Label>
                <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-60" placeholder="person@rootmail.io" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-name">Name</Label>
                <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className="w-44" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-role">Role</Label>
                <select
                  id="s-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" onClick={create} disabled={pending || !email}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Create
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A one-time password is generated and shown once — share it securely; they can change it after logging in.
            </p>
          </CardContent>
        ) : null}

        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => {
                const self = s.id === currentId;
                return (
                  <TableRow key={s.id} className={cn(!s.active && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(s)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {s.name || s.email}
                            {self ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                          </span>
                          {s.name ? (
                            <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
                          ) : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage && !self && s.active ? (
                        <select
                          value={s.role}
                          onChange={(e) => act(() => setStaffRoleAction(s.id, e.target.value as StaffRole))}
                          disabled={pending}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <RoleBadge role={s.role} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "muted"}>{s.active ? "active" : "deactivated"}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="space-x-2 text-right">
                        {!self && s.active ? (
                          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => act(() => deactivateStaffAction(s.id))}>
                            Deactivate
                          </Button>
                        ) : null}
                        {!s.active ? (
                          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => act(() => reactivateStaffAction(s.id))}>
                            Reactivate
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => resetPw(s.id, s.email)}>
                          <KeyRound className="size-3.5" /> Reset
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
