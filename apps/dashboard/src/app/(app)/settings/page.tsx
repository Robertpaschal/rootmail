import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, CreditCard, FileCheck2, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";

// Settings hub: the account basics up top, then a tidy map to the deeper
// controls. Keeps the top bar uncluttered (the account chip links here).
const sections = [
  {
    href: "/settings/security",
    title: "Security & login",
    desc: "Password, two-factor authentication, and email preferences.",
    icon: ShieldCheck,
  },
  {
    href: "/billing",
    title: "Plan & usage",
    desc: "Your plan, monthly limits, invoices, and add-ons.",
    icon: CreditCard,
  },
  {
    href: "/members",
    title: "Team & roles",
    desc: "Invite teammates and control who can do what.",
    icon: UserCog,
  },
  {
    href: "/compliance",
    title: "Sending & compliance",
    desc: "Your sender address and exportable proof of delivery.",
    icon: FileCheck2,
  },
];

export default async function SettingsHubPage() {
  let name = "";
  let email = "";
  let verified = false;
  let workspace = "";
  try {
    const me = await api.me();
    name = me.user.name ?? "";
    email = me.user.email;
    verified = me.user.email_verified;
    workspace = (me.active_workspace ?? me.workspaces[0])?.name ?? "";
  } catch {
    /* render with defaults if the lookup fails */
  }

  return (
    <>
      <PageHeader title="Settings" description="Your account, security, and workspace controls." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>How you sign in and who you are on rootmail.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field label="Name" value={name || "—"} />
            <Field
              label="Email"
              value={email || "—"}
              badge={
                verified ? (
                  <Badge variant="success">
                    <BadgeCheck className="size-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )
              }
            />
            <Field label="Workspace" value={workspace || "—"} />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link key={s.href} href={s.href} className="group block">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
                    <s.icon className="size-4" />
                  </span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, badge }: { label: string; value: string; badge?: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-medium">
        <span className="truncate">{value}</span>
        {badge}
      </p>
    </div>
  );
}
