import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown, Megaphone, MessageSquare, Paperclip, Send, User, Workflow } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { LiveStatus } from "./live-status";
import { MessageContent } from "./message-content";
import { DownloadProof } from "./download-proof";
import { LocalTime } from "@/components/app/local-time";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AuditEntry, ContactDetail, Message, Thread } from "@/lib/types";
import { STAGE_META } from "@/lib/stages";
import { cn } from "@/lib/utils";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeOf(trail: AuditEntry[], event: string): string | undefined {
  return trail.find((e) => e.event === event)?.timestamp;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let message: Message;
  let trail: AuditEntry[];
  try {
    const [m, a] = await Promise.all([api.getMessage(id), api.getAudit(id)]);
    message = m;
    trail = a.trail;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Message" backHref="/messages" backLabel="Messages" />
        <ConnectionErrorCard
          message={err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."}
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const sentAt = timeOf(trail, "sent") ?? message.created_at;
  const deliveredAt = timeOf(trail, "delivered");
  const fromLabel = message.from.name ? `${message.from.name} · ${message.from.email}` : message.from.email;

  // The relationship around this email — the contact it reached, where it came
  // from (campaign / sequence / a direct one-to-one send), and any live
  // conversation with this person. All best-effort: the message stands alone.
  const [contactR, campaignR, sequenceR, threadsR] = await Promise.allSettled([
    message.to_contact_id ? api.contactDetail(message.to_contact_id) : Promise.resolve(null),
    message.campaign_id ? api.getCampaign(message.campaign_id) : Promise.resolve(null),
    message.sequence_id ? api.getSequence(message.sequence_id) : Promise.resolve(null),
    api.listThreads(),
  ]);
  const settled = <T,>(r: PromiseSettledResult<T | null>) => (r.status === "fulfilled" ? r.value : null);
  const contact: ContactDetail | null = settled(contactR);
  const campaign = settled(campaignR);
  const sequence = settled(sequenceR);
  const toEmail = message.to.toLowerCase();
  const threads = (settled(threadsR)?.data ?? []).filter(
    (t: Thread) => t.contact_email.toLowerCase() === toEmail,
  );
  // Prefer the conversation this exact email opened (same base subject), else the
  // most recent one with this person.
  const baseSubject = (s: string) => s.replace(/^((re|fwd?):\s*)+/i, "").trim().toLowerCase();
  const conversation =
    threads.find((t) => baseSubject(t.subject) === baseSubject(message.subject || "")) ?? threads[0] ?? null;
  const otherSends = (contact?.recent_messages ?? []).filter((m) => m.id !== message.id).slice(0, 3);

  return (
    <>
      <PageHeader title={message.subject || "(no subject)"} description={`To ${message.to}`} backHref="/messages" backLabel="Messages" />

      {/* The send tracker — advances on its own; sandbox gets its own treatment. */}
      <div className="mb-6">
        <LiveStatus id={message.id} initialMessage={message} initialTrail={trail} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content</CardTitle>
            </CardHeader>
            <CardContent>
              <MessageContent html={message.rendered_html} text={message.rendered_text} />
            </CardContent>
          </Card>

          {message.attachments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {message.attachments.map((a) => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <span className="font-medium">{a.filename}</span>
                    <span className="text-xs text-muted-foreground">{fmtSize(a.size)}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Details a normal sender cares about. */}
        <div className="space-y-4">
          {/* The relationship: this email in the context of the PERSON — their
              record, where the send came from, the rest of their history, and
              the live conversation if one is open. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recipient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact ? (
                <Link
                  href={`/contacts/${contact.id}`}
                  className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(contact.name?.trim()[0] ?? contact.email[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-primary">
                      {contact.name ?? contact.email}
                    </span>
                    {contact.name ? (
                      <span className="block truncate text-xs text-muted-foreground">{contact.email}</span>
                    ) : null}
                  </span>
                  <Badge className={cn("shrink-0 border-transparent", STAGE_META[contact.stage].badge)}>
                    {STAGE_META[contact.stage].label}
                  </Badge>
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <User className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{message.to}</p>
                    <p className="text-xs text-muted-foreground">
                      Not in your audience yet —{" "}
                      <Link href="/contacts" className="text-primary hover:underline">
                        add them
                      </Link>{" "}
                      to build their history.
                    </p>
                  </div>
                </div>
              )}

              {/* Where this email came from. */}
              <div className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                {campaign ? (
                  <>
                    <Megaphone className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">
                      From campaign{" "}
                      <Link href={`/campaigns/${campaign.id}`} className="font-medium text-primary hover:underline">
                        {campaign.name}
                      </Link>
                    </span>
                  </>
                ) : sequence ? (
                  <>
                    <Workflow className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">
                      Step of sequence{" "}
                      <Link href={`/sequences/${sequence.id}`} className="font-medium text-primary hover:underline">
                        {sequence.name}
                      </Link>
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="size-4 shrink-0" />
                    <span>Direct one-to-one send</span>
                  </>
                )}
              </div>

              {/* The rest of their history, right here. */}
              {otherSends.length > 0 ? (
                <div className="space-y-1 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Also sent to them</p>
                  {otherSends.map((m) => (
                    <Link
                      key={m.id}
                      href={`/messages/${m.id}`}
                      className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60"
                    >
                      <span className="min-w-0 flex-1 truncate">{m.subject || "(no subject)"}</span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">{m.status}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(m.sent_at)}</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
                {contact ? (
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Full history &amp; profile <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
                {conversation ? (
                  <Link
                    href={`/inbox/${conversation.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    <MessageSquare className="size-3.5" /> Open conversation
                  </Link>
                ) : (
                  <Link
                    href={`/messages/new?to=${encodeURIComponent(message.to)}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Send className="size-3.5" /> Email them again
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              <DetailRow label="To"><span>{message.to}</span></DetailRow>
              <DetailRow label="From"><span>{fromLabel}</span></DetailRow>
              {message.reply_to ? <DetailRow label="Replies to"><span>{message.reply_to}</span></DetailRow> : null}
              <DetailRow label="Sent"><LocalTime iso={sentAt} /></DetailRow>
              {deliveredAt ? <DetailRow label="Delivered"><LocalTime iso={deliveredAt} /></DetailRow> : null}
              {message.scheduled_at ? <DetailRow label="Scheduled"><LocalTime iso={message.scheduled_at} /></DetailRow> : null}
              {message.attachments.length > 0 ? <DetailRow label="Attachments">{message.attachments.length}</DetailRow> : null}
              {message.sandbox ? <DetailRow label="Environment"><Badge variant="warning">Test</Badge></DetailRow> : null}
            </CardContent>
          </Card>

          {/* Developer identifiers — for the API/CLI/SDK, out of the everyday view. */}
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-medium">
              Developer details
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="divide-y px-6 pb-2">
              <DetailRow label="Message ID">
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-xs">{message.id}</span>
                  <CopyButton value={message.id} />
                </span>
              </DetailRow>
              {message.idempotency_key ? (
                <DetailRow label="Idempotency key"><span className="font-mono text-xs">{message.idempotency_key}</span></DetailRow>
              ) : null}
              <DetailRow label="Type"><span className="capitalize">{message.type}</span></DetailRow>
              <DetailRow label="Priority"><span className="capitalize">{message.priority}</span></DetailRow>
              {message.template_id ? (
                <DetailRow label="Template"><span className="font-mono text-xs">{message.template_id}{message.template_version ? ` · v${message.template_version}` : ""}</span></DetailRow>
              ) : null}
              {message.sub_tenant_id ? (
                <DetailRow label="Client (sub-tenant)"><Link href={`/sub-tenants/${message.sub_tenant_id}`} className="font-mono text-xs text-primary hover:underline">{message.sub_tenant_id}</Link></DetailRow>
              ) : null}
              {message.provider ? <DetailRow label="Provider"><span className="capitalize">{message.provider}</span></DetailRow> : null}
              {message.provider_message_id ? <DetailRow label="Provider message ID"><span className="font-mono text-xs">{message.provider_message_id}</span></DetailRow> : null}
              {message.content_hash ? <DetailRow label="Content hash"><span className="font-mono text-xs">{message.content_hash.slice(0, 16)}…</span></DetailRow> : null}
              {message.tags.length > 0 ? <DetailRow label="Tags"><span className="font-mono text-xs">{message.tags.join(", ")}</span></DetailRow> : null}
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-muted-foreground">Signed proof</span>
                <DownloadProof messageId={message.id} />
              </div>
              <p className="py-3 text-xs text-muted-foreground">
                These identifiers are for the API, CLI, and SDK.{" "}
                <Link href="/docs" className="text-primary hover:underline">See the developer docs</Link>.
              </p>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
