import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminApi, ApiError } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDate, formatDateTime } from "@/lib/format";
import { LEAD_STATUS_LABEL, leadStatusVariant } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddNoteForm } from "./add-note-form";
import { assignLead, setLeadStatus } from "./actions";

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
    { label: "Company size", value: lead.company_size ?? "—" },
    { label: "Expected volume", value: lead.expected_volume ?? "—" },
    { label: "Current provider", value: lead.current_provider ?? "—" },
    { label: "Source", value: lead.source },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{lead.company || lead.name}</h1>
          <Badge variant={leadStatusVariant(lead.status)}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{lead.id}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Enquiry</CardTitle>
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
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <AddNoteForm leadId={lead.id} />
              {lead.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-4 border-t pt-4">
                  {lead.notes.map((n) => (
                    <li key={n.id} className="flex gap-3 text-sm">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.kind === "system" ? "bg-muted-foreground/40" : "bg-primary",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn(n.kind === "system" && "text-muted-foreground")}>
                          {n.body}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {n.staff_email ?? "system"} · {formatDateTime(n.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUSES.map((s) => {
                  const isCurrent = s === lead.status;
                  return (
                    <form key={s} action={setLeadStatus}>
                      <input type="hidden" name="id" value={lead.id} />
                      <input type="hidden" name="status" value={s} />
                      <SubmitButton
                        variant={isCurrent ? "default" : "outline"}
                        size="sm"
                        disabled={isCurrent}
                        pendingLabel="…"
                      >
                        {LEAD_STATUS_LABEL[s]}
                      </SubmitButton>
                    </form>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owner</CardTitle>
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
                <CardTitle>Linked customer</CardTitle>
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
              <CardTitle>Meta</CardTitle>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
