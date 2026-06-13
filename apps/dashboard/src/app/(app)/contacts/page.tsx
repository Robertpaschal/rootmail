import type { ReactNode } from "react";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { unsubscribeContact } from "./actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ContactStatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Contact } from "@/lib/types";
import { UpsertContactForm } from "./upsert-form";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  let contact: Contact | null = null;
  let suppressed: boolean | null = null;
  let lookupError: string | null = null;
  let missing = false;

  if (email) {
    try {
      suppressed = (await api.checkSuppression(email)).suppressed;
    } catch (err) {
      if (err instanceof ConnectionError) lookupError = err.message;
    }
    try {
      contact = await api.getContact(email);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) missing = true;
      else if (err instanceof ConnectionError || err instanceof ApiError) lookupError = err.message;
      else lookupError = "An unexpected error occurred.";
    }
  }

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Look up a contact, check suppression, and manage subscription status."
      />

      <Card className="mb-6">
        <CardContent className="p-4">
          <form action="/contacts" method="get" className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="email"
              type="email"
              placeholder="Find a contact by email…"
              defaultValue={email ?? ""}
              className="sm:max-w-sm"
            />
            <Button type="submit" variant="secondary">
              <Search className="size-4" /> Look up
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {lookupError ? (
            <ConnectionErrorCard message={lookupError} showReconnect />
          ) : !email ? (
            <EmptyState
              icon={<Search className="size-6" />}
              title="Look up a contact"
              description="Search by email to see status, suppression, tags, and metadata. The API addresses contacts by email — there's no list endpoint."
            />
          ) : (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="min-w-0 truncate text-base">{email}</CardTitle>
                {suppressed !== null ? (
                  suppressed ? (
                    <Badge variant="destructive">
                      <ShieldAlert /> Suppressed
                    </Badge>
                  ) : (
                    <Badge variant="success">
                      <ShieldCheck /> Not suppressed
                    </Badge>
                  )
                ) : null}
              </CardHeader>
              <CardContent className="divide-y pt-0">
                {missing ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    No contact record for this email yet. It can still be suppressed, and you can add
                    it on the right.
                  </p>
                ) : contact ? (
                  <>
                    <DetailRow label="Status">
                      <ContactStatusBadge status={contact.status} />
                    </DetailRow>
                    <DetailRow label="Name">{contact.name ?? "—"}</DetailRow>
                    <DetailRow label="Phone">{contact.phone ?? "—"}</DetailRow>
                    <DetailRow label="Tags">
                      {contact.tags.length ? (
                        <span className="font-mono text-xs">{contact.tags.join(", ")}</span>
                      ) : (
                        "—"
                      )}
                    </DetailRow>
                    {contact.sub_tenant_id ? (
                      <DetailRow label="Sub-tenant">
                        <span className="font-mono text-xs">{contact.sub_tenant_id}</span>
                      </DetailRow>
                    ) : null}
                    <DetailRow label="Created">{formatDateTime(contact.created_at)}</DetailRow>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-muted-foreground">Subscription</span>
                      {contact.status === "unsubscribed" ? (
                        <Button variant="outline" size="sm" disabled>
                          Unsubscribed
                        </Button>
                      ) : (
                        <form action={unsubscribeContact}>
                          <input type="hidden" name="email" value={contact.email} />
                          <SubmitButton variant="outline" size="sm" pendingLabel="Working…">
                            Unsubscribe
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        <UpsertContactForm defaultEmail={email ?? ""} />
      </div>
    </>
  );
}
