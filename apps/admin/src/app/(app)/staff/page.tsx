import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/admin-api";
import type { StaffAuditEntry } from "@/lib/types";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const [me, staffList, audit] = await Promise.all([
    adminApi.me(),
    adminApi.listStaff(),
    adminApi.listStaffAudit().catch(() => ({ data: [] as StaffAuditEntry[] })),
  ]);
  const canManage = me.permissions.includes("staff.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Your internal team.{" "}
          {canManage
            ? "Create accounts, assign roles, deactivate, and reset passwords."
            : "Read-only — ask a superadmin to make changes."}
        </p>
      </div>

      <StaffManager staff={staffList.data} canManage={canManage} currentId={me.staff.id} />

      <Card>
        <CardHeader>
          <CardTitle>Recent staff activity</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {audit.data.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No staff activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.action}</TableCell>
                    <TableCell className="text-muted-foreground">{e.actor_email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof e.metadata?.email === "string" ? e.metadata.email : (e.target_id ?? "—")}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
