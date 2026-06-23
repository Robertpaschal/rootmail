"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
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
import type { StaffRole, StaffUser } from "@/lib/types";

const ROLES: StaffRole[] = ["superadmin", "billing", "support", "readonly"];

export function StaffManager({
  staff,
  canManage,
  currentId,
}: {
  staff: StaffUser[];
  canManage: boolean;
  currentId: string;
}) {
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

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add staff</CardTitle>
          </CardHeader>
          <CardContent>
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
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => {
                const self = s.id === currentId;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.email}
                      {self ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.name ?? "—"}</TableCell>
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
                        <Badge variant="muted">{s.role}</Badge>
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
