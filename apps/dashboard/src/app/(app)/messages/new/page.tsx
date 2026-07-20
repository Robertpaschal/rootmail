import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
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
  try {
    // Each list degrades independently — client domains are a gated add-on, and a
    // 402 there must never blank the templates/senders of a free-tier composer.
    const [t, tpl, sn] = await Promise.all([
      api.listSubTenants().catch(() => ({ data: [] as SubTenant[] })),
      api.listTemplates(),
      api.listSenders().catch(() => ({ data: [] })),
    ]);
    tenants = t.data;
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
        description="Write it, see it, send it — the preview shows exactly what your recipient gets."
        backHref="/messages"
        backLabel="Messages"
      />
      {senders.length === 0 ? (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-400/50 bg-amber-50/60 p-4 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium">Send from your own address — one-time setup (~5 min)</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add an address like hello@yourcompany.com and click the link we email to confirm it.
                Until then, email goes out from a rootmail address.
              </p>
            </div>
          </div>
          <Link
            href="/settings/sender"
            className="inline-flex shrink-0 items-center gap-1 self-start rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 sm:self-center"
          >
            Verify a sender <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : null}
      <SendForm tenants={tenants} templates={templates} senders={senders} initialTo={initialTo} initialSubject={initialSubject} />
    </>
  );
}
