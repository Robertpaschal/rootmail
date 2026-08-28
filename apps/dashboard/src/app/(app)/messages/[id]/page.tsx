import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FlaskConical } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { LiveStatus } from "./live-status";
import { MessageCard } from "./message-card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AuditEntry, ContactDetail, Message, TestRecipient, Thread } from "@/lib/types";

function timeOf(trail: AuditEntry[], event: string): string | undefined {
  return trail.find((e) => e.event === event)?.timestamp;
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
          status={err instanceof ApiError ? err.status : undefined}
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
  const [contactR, campaignR, sequenceR, threadsR, testR] = await Promise.allSettled([
    message.to_contact_id ? api.contactDetail(message.to_contact_id) : Promise.resolve(null),
    message.campaign_id ? api.getCampaign(message.campaign_id) : Promise.resolve(null),
    message.sequence_id ? api.getSequence(message.sequence_id) : Promise.resolve(null),
    api.listThreads(),
    message.test_recipient ? api.listTestRecipients() : Promise.resolve(null),
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
  // A test send: real mail, safe destination. Name the scenario so a deliberate
  // bounce is never mistaken for a deliverability problem.
  const scenario: TestRecipient | null =
    (settled(testR)?.data ?? []).find((t: TestRecipient) => t.slug === message.test_recipient) ?? null;
  const otherSends = (contact?.recent_messages ?? []).filter((m) => m.id !== message.id).slice(0, 3);

  return (
    <>
      <PageHeader title={message.subject || "(no subject)"} description={`To ${message.to}`} backHref="/messages" backLabel="Messages" />

      {scenario ? (
        // A test send is real mail to a safe destination — neither an
        // intervention nor a stop, so it carries no signal colour. The dashed
        // rule is this system's "not the real thing" everywhere else.
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-lg border border-dashed bg-muted/40 p-4">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Test send · {scenario.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {scenario.description} This took the real send path to your provider&apos;s mailbox simulator — no
              person received it, and it doesn&apos;t count against your sending reputation.
            </p>
          </div>
          <Link
            href="/testing"
            className="shrink-0 self-center text-sm font-medium hover:underline"
          >
            Testing <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
      ) : null}

      {/* A DOSSIER, not two stacked boxes.
          A message detail is one record with a lifeline, so the page is laid
          out as one: the record on the left — status, the line, every step we
          witnessed — running down beside the email it describes. Stacked cards
          made the delivery story a widget you scroll past on the way to the
          content; here the two are read together, which is the whole point of
          keeping a record at all. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        {/* The send tracker — advances on its own; sandbox gets its own treatment. */}
        {/* `top-20`: clear of the app's `sticky top-0 h-16` topbar. */}
        <div className="lg:sticky lg:top-20">
          <LiveStatus id={message.id} initialMessage={message} initialTrail={trail} />
        </div>

        {/* Recipient + content + details as ONE object, the way a mail client
            shows an email. Depth is layered behind the header chevron rather
            than spread across four boxes in a side rail. */}
        <MessageCard
        message={message}
        fromLabel={fromLabel}
        sentAt={sentAt}
        deliveredAt={deliveredAt}
        contact={contact}
        campaign={campaign ? { id: campaign.id, name: campaign.name } : null}
        sequence={sequence ? { id: sequence.id, name: sequence.name } : null}
        conversationId={conversation?.id ?? null}
        otherSends={otherSends.map((m) => ({
          id: m.id,
          subject: m.subject,
          status: m.status,
          sent_at: m.sent_at,
        }))}
        />
      </div>
    </>
  );
}
