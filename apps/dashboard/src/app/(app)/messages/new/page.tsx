import { Line } from "@rootmail/design";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { SendingAccessNote } from "@/components/app/sending-access-note";
import { SEND_HALT_REASON } from "@/lib/home";
import { api } from "@/lib/rootmail";
import type { SubTenant, TestRecipient } from "@/lib/types";
import { SendForm, type ComposeTemplate } from "./send-form";

// Supports prefill via query params (?to=&subject=) so the Replies inbox can open
// a full-featured compose "in context": a Re: subject rejoins that conversation's
// thread automatically, a fresh subject starts a new one.
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; subject?: string }>;
}) {
  const { to: initialTo = "", subject: initialSubject = "" } = await searchParams;
  let tenants: SubTenant[] = [];
  let templates: ComposeTemplate[] = [];
  let senders: { email: string; display_name: string | null }[] = [];
  // "Send a test" needs somewhere safe to send: the user's own address, and the
  // reserved addresses that force a known delivery outcome.
  let testRecipients: TestRecipient[] = [];
  let myEmail: string | null = null;
  let productName: string | null = null;
  try {
    // Each list degrades independently — client domains are a gated add-on, and a
    // 402 there must never blank the templates/senders of a free-tier composer.
    const [t, tpl, sn, tr, me, org] = await Promise.all([
      api.listSubTenants().catch(() => ({ data: [] as SubTenant[] })),
      api.listTemplates(),
      api.listSenders().catch(() => ({ data: [] })),
      api.listTestRecipients().catch(() => ({ data: [] as TestRecipient[] })),
      api.me().catch(() => null),
      api.getOrganization().catch(() => null),
    ]);
    tenants = t.data;
    testRecipients = tr.data;
    myEmail = me?.user.email ?? null;
    productName = org?.name ?? null;
    templates = tpl.data.map((x) => ({
      slug: x.slug,
      name: x.name,
      subject: x.subject,
      html: x.html,
      type: x.type,
    }));
    senders = sn.data
      .filter((s) => s.status === "verified")
      .map((s) => ({ email: s.email, display_name: s.display_name }));
  } catch {
    /* compose still works without either list */
  }

  return (
    <>
      <PageHeader
        title="New email"
        description="Write it and see exactly what the recipient would get."
        backHref="/messages"
        backLabel="Mail"
      />
      <SendingAccessNote />
      {senders.length === 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Line
            stations={[
              { label: "Write", state: "unknown" },
              { label: "Send", state: "stopped", reason: "no sending identity" },
            ]}
          />
          <p className="text-sm text-ink-muted">{SEND_HALT_REASON}</p>
          <Link href="/settings/sender" className="text-sm font-medium underline underline-offset-4">Set up your sending address →</Link>
        </div>
      ) : null}
      <SendForm
        tenants={tenants}
        templates={templates}
        senders={senders}
        initialTo={initialTo}
        initialSubject={initialSubject}
        testRecipients={testRecipients}
        myEmail={myEmail}
        productName={productName}
        canSend={senders.length > 0}
      />
    </>
  );
}
