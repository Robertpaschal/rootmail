import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { MembersResult } from "@/lib/types";
import { InviteForm, RevokeInvite } from "./invite-form";

export default async function MembersPage() {
  let data: MembersResult | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    data = await api.getMembers();
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed || !data) {
    return (
      <>
        <PageHeader title="Team" />
        <ConnectionErrorCard message={failed ?? "No data."} showReconnect={isApiErr} />
      </>
    );
  }

  // Custom roles are a Scale feature — offer them in the picker when available.
  let customRoles: { id: string; name: string }[] = [];
  try {
    customRoles = (await api.listRoles()).data.map((r) => ({ id: r.id, name: r.name }));
  } catch {
    /* not available on this plan — system roles only */
  }

  const { seats, members, invitations } = data;
  const seatLabel =
    seats.capacity === -1
      ? `${seats.used} in use · unlimited`
      : `${seats.used} of ${seats.capacity} seats used`;

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite teammates to your workspace. Pending invitations hold a seat until accepted."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Members</CardTitle>
              <Badge variant="secondary">{seatLabel}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {relativeTime(m.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {invitations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending invitations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {invitations.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{i.role}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          expires {relativeTime(i.expires_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RevokeInvite id={i.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm customRoles={customRoles} />
            <p className="mt-3 text-xs text-muted-foreground">
              Need more seats?{" "}
              <a href="/billing/addons?focus=extra_seat" className="underline">
                Add seats
              </a>{" "}
              — they take effect immediately.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
