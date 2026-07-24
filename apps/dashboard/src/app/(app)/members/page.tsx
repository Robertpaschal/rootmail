import Link from "next/link";
import { Fingerprint, ShieldCheck, UserPlus, Users } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { InlineReveal } from "@/components/app/reveal-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { MembersResult } from "@/lib/types";
import { InviteForm, RevokeInvite } from "./invite-form";
import { RolesSection } from "./roles-section";
import { SsoSection } from "./sso-section";

type Tab = "people" | "roles" | "sso";

// ONE Team hub: the people, the roles that define what they can do, and the
// single sign-on they use to get in. Three facets of the same thing — never
// three scattered sections.
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "people", label: "People", icon: Users },
  { id: "roles", label: "Roles", icon: ShieldCheck },
  { id: "sso", label: "Single sign-on", icon: Fingerprint },
];

const TAB_DESC: Record<Tab, string> = {
  people: "Invite teammates to your workspace. A pending invitation holds a seat until it's accepted.",
  roles: "What each teammate is allowed to do — built-in roles on every plan, custom ones when you need finer control.",
  sso: "How your team signs in — SAML SSO with your identity provider, with SCIM provisioning.",
};

function TabStrip({ active }: { active: Tab }) {
  return (
    <div className="inline-flex rounded-lg bg-secondary/60 p-1">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.id === "people" ? "/members" : `/members?tab=${t.id}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}

async function PeopleSection() {
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
    return <ConnectionErrorCard message={failed ?? "No data."} showReconnect={isApiErr} />;
  }

  // Custom roles are an add-on — offer them in the picker when available.
  let customRoles: { id: string; name: string }[] = [];
  try {
    customRoles = (await api.listRoles()).data.map((r) => ({ id: r.id, name: r.name }));
  } catch {
    /* not available on this plan — system roles only */
  }

  const { seats, members, invitations } = data;
  const seatsFull = seats.capacity !== -1 && seats.used >= seats.capacity;
  const seatLabel =
    seats.capacity === -1 ? `${seats.used} in use · unlimited` : `${seats.used} of ${seats.capacity} seats used`;

  return (
    <Reveal className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Members</CardTitle>
            <Badge variant={seatsFull ? "warning" : "secondary"}>{seatLabel}</Badge>
          </div>
          {/* View-first: the invite form is revealed on demand, not always open. */}
          {seatsFull ? (
            <a href="/billing/addons?focus=extra_seat" className={cn(buttonVariants({ size: "sm" }))}>
              <UserPlus className="size-4" /> Add seats to invite more
            </a>
          ) : (
            <InlineReveal triggerLabel="Invite teammate">
              <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                <InviteForm customRoles={customRoles} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Need more seats?{" "}
                  <a href="/billing/addons?focus=extra_seat" className="underline">Add seats</a> — they take effect immediately.
                </p>
              </div>
            </InlineReveal>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                icon={<Users className="size-6" />}
                title="It's just you so far"
                description="Invite teammates to send, manage content, or handle billing — each gets exactly the access their role allows."
              />
            </div>
          ) : (
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
          )}
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
                    <TableCell className="text-muted-foreground">expires {relativeTime(i.expires_at)}</TableCell>
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
    </Reveal>
  );
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "roles" || sp.tab === "sso" ? sp.tab : "people";

  return (
    <>
      <PageHeader title="Team" description={TAB_DESC[tab]} actions={<TabStrip active={tab} />} />
      {tab === "people" ? <PeopleSection /> : tab === "roles" ? <RolesSection /> : <SsoSection />}
    </>
  );
}
