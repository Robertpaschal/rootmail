import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Mail, MessageSquare } from "lucide-react";
import { adminApi, ApiError } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { LEAD_STATUS_LABEL, leadStatusVariant } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { AddNoteForm } from "./add-note-form";
import { LeadPipeline } from "./lead-pipeline";
import { assignLead } from "./actions";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead;
  try {
    lead = await adminApi.getLead(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { staff } = await adminApi.me();
  const ownedByMe = lead.owner_staff_id === staff.id;
  const display = lead.company || lead.name;

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: lead.name },
    {
      label: "Email",
      value: (
        <a href={`mailto:${lead.email}`} className="hover:underline">
          {lead.email}
        </a>
      ),
    },
    { label: "Phone", value: lead.phone ?? "—" },
    { label: "Company", value: lead.company ?? "—" },
    {
      label: "Website",
      value: lead.website ? (
        <a
          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {lead.website}
        </a>
      ) : (
        "—"
      ),
    },
    { label: "Source", value: lead.source },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Leads
      </Link>

      {/* Contact hero */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
          {display.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{display}</h1>
            <Badge variant={leadStatusVariant(lead.status)}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lead.company ? `${lead.name} · ` : ""}
            {lead.email} · created {timeAgo(lead.created_at)}
          </p>
        </div>
        <a
          href={`mailto:${lead.email}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Mail className="size-4" /> Email
        </a>
      </div>

      {/* Pipeline — the headline CRM control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadPipeline id={lead.id} status={lead.status} />
        </CardContent>
      </Card>

      {/* Qualifying signals — what a rep scans first */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Signal label="Expected volume" value={lead.expected_volume} />
        <Signal label="Company size" value={lead.company_size} />
        <Signal label="Current provider" value={lead.current_provider} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enquiry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {fields.map((f) => (
                <div key={f.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                  <span className="w-40 shrink-0 text-muted-foreground">{f.label}</span>
                  <span className="min-w-0">{f.value}</span>
                </div>
              ))}
              {lead.message ? (
                <div className="border-t pt-3">
                  <div className="mb-1 text-muted-foreground">Message</div>
                  <p className="whitespace-pre-wrap">{lead.message}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <AddNoteForm leadId={lead.id} />
              {lead.notes.length === 0 ? (
                <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
                  <Activity className="size-4" /> No activity logged yet — add the first note above.
                </div>
              ) : (
                <ol className="border-t pt-4">
                  {lead.notes.map((n, i) => {
                    const last = i === lead.notes.length - 1;
                    const system = n.kind === "system";
                    return (
                      <li key={n.id} className="relative flex gap-3 pb-5 last:pb-0">
                        {!last ? (
                          <span
                            className="absolute bottom-0 left-3 top-7 w-px bg-border"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className={cn(
                            "z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                            system
                              ? "border-border bg-muted text-muted-foreground"
                              : "border-primary/20 bg-primary/10 text-primary",
                          )}
                        >
                          {system ? (
                            <Activity className="size-3" />
                          ) : (
                            <MessageSquare className="size-3" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm", system && "text-muted-foreground")}>{n.body}</p>
                          <p
                            className="mt-0.5 text-xs text-muted-foreground"
                            title={formatDateTime(n.created_at)}
                          >
                            {n.staff_email ?? "system"} · {timeAgo(n.created_at)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {lead.owner_email
                  ? ownedByMe
                    ? "You own this lead."
                    : lead.owner_email
                  : "Unassigned."}
              </p>
              <div className="flex gap-2">
                {ownedByMe ? (
                  <form action={assignLead}>
                    <input type="hidden" name="id" value={lead.id} />
                    <input type="hidden" name="owner_staff_id" value="" />
                    <SubmitButton variant="outline" size="sm" pendingLabel="…">
                      Release
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={assignLead}>
                    <input type="hidden" name="id" value={lead.id} />
                    <input type="hidden" name="owner_staff_id" value={staff.id} />
                    <SubmitButton variant="outline" size="sm" pendingLabel="…">
                      {lead.owner_email ? "Take over" : "Claim"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>

          {lead.organization ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Linked customer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link href={`/orgs/${lead.organization.id}`} className="font-medium hover:underline">
                  {lead.organization.name}
                </Link>
                <div className="mt-1">
                  <Badge variant={lead.organization.plan === "free" ? "muted" : "default"}>
                    {lead.organization.plan}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(lead.created_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(lead.updated_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Lead ID</span>
                <span className="font-mono text-xs">{lead.id}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm", value ? "font-medium" : "text-muted-foreground/50")}>
        {value || "Not provided"}
      </div>
    </div>
  );
}
