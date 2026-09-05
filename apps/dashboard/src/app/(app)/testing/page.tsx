import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleDashed, FlaskConical, Inbox, PenLine, Radio, XCircle } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { SandboxToggle } from "@/components/app/sandbox-toggle";
import { MessageStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message, MessageStatus, TestRecipient } from "@/lib/types";
import { Scenarios } from "./scenarios";
import { TestInboxes } from "./test-inboxes";

export const metadata: Metadata = { title: "Testing" };

/**
 * Testing — proving things work before real people are involved.
 *
 * Deliberately NOT two equal halves. The page leads with the part that matters
 * to everyone who sends email: a real send, down the real path, to a place that
 * can't be harmed. The sandbox comes after it, plainly labelled as the
 * developer rehearsal room it is — because presenting the two as peers is what
 * made "what is this for?" the first reaction.
 */

/** Did the send end where the scenario promised? */
function verdict(expected: TestRecipient["outcome"] | undefined, status: MessageStatus) {
  if (!expected) return null;
  if (status === "queued" || status === "sending" || status === "sent") return "pending" as const;
  const ok =
    expected === "bounced"
      ? status === "bounced"
      : expected === "complained"
        ? status === "complained"
        : expected === "suppressed"
          ? status === "suppressed" || status === "bounced"
          : status === "delivered";
  return ok ? ("match" as const) : ("mismatch" as const);
}

export default async function TestingPage() {
  const [identity, access] = await Promise.allSettled([api.me(), api.sendingAccess()]);
  const me = identity.status === "fulfilled" ? identity.value : null;
  let recipients: TestRecipient[] = [];
  let runs: Message[] = [];
  let sandboxMail: Message[] = [];
  let sandbox = false;
  let sandboxId: string | null = null;
  let liveId: string | null = null;
  let liveName: string | null = null;
  let failed: string | null = null;
  let errStatus: number | undefined;

  try {
    const [cat, me] = await Promise.all([api.listTestRecipients(), api.me().catch(() => null)]);
    recipients = cat.data;
    const active = me?.active_workspace ?? me?.workspaces?.[0] ?? null;
    sandbox = active?.environment === "test";
    sandboxId = me?.workspaces?.find((w) => w.environment === "test")?.id ?? null;
    const live = me?.workspaces?.find((w) => w.environment === "live") ?? null;
    liveId = live?.id ?? null;
    liveName = live?.name ?? null;
    const [tests, sbx] = await Promise.all([
      api.listMessages({ test: true, limit: 20 }),
      sandbox ? api.listMessages({ sandbox: true, limit: 20 }) : Promise.resolve({ data: [] as Message[] }),
    ]);
    runs = tests.data;
    // Test-recipient runs have their own table above — don't show them twice.
    sandboxMail = sbx.data.filter((m) => !m.test_recipient);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  const bySlug = new Map(recipients.map((r) => [r.slug, r]));

  return (
    <>
      <PageHeader
        title="Testing"
        description="Prepare an email you will actually use. Check it in an inbox, follow its delivery record, and rehearse what happens when a send fails."
      />

      <div className="mb-8 space-y-6">
        {me?.beta ? (
          <section className="rounded-lg border bg-card p-5 shadow-e1">
            <h2 className="text-xl font-semibold">Build your first reusable email workflow</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Choose a welcome email, receipt or update your business needs. Your templates, audience structure and sequence drafts stay in this workspace as sending access expands.</p>
            <ol className="mt-5 grid gap-5 md:grid-cols-3">
              <li><p className="text-sm font-semibold">1. Set up your sending address</p><p className="mt-1 text-sm text-muted-foreground">Verify the address your recipients should recognise. Check where replies will go.</p><Link className="mt-2 inline-block text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline" href="/settings/sender">Set up sending →</Link></li>
              <li><p className="text-sm font-semibold">2. Make an email worth keeping</p><p className="mt-1 text-sm text-muted-foreground">Adapt the starter template to your brand. Reuse it in individual emails, campaigns and sequences.</p><Link className="mt-2 inline-block text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline" href="/templates">Open templates →</Link></li>
              <li><p className="text-sm font-semibold">3. Check it with a real person</p><p className="mt-1 text-sm text-muted-foreground">Confirm an inbox below, send your template from the composer, then inspect the delivery record and replies.</p><Link className="mt-2 inline-block text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline" href="/messages">Follow your messages →</Link></li>
            </ol>
            <p className="mt-5 border-t pt-3 text-sm text-muted-foreground">Already sending with your own provider? <Link href="/settings/sender" className="text-foreground underline underline-offset-4 hover:no-underline">Connect an approved SES or active Mailgun account</Link> to use its sending access. Tell us where this workflow slows you down through the <Link href="/assistant?pane=support" className="text-foreground underline underline-offset-4 hover:no-underline">support team</Link>.</p>
          </section>
        ) : null}
        <TestInboxes initial={access.status === "fulfilled" ? access.value : null} email={me?.user.email ?? ""} beta={Boolean(me?.beta)} error={access.status === "rejected" ? "We could not load your test inboxes. Try checking status again." : undefined} />
      </div>

      {failed ? (
        <ConnectionErrorCard message={failed} status={errStatus} />
      ) : (
        <div className="space-y-10">
          {/* ── The main event: real sends, safe destinations ─────────────── */}
          <section className="space-y-4">
            <div className="rounded-lg border border-witnessed/30 bg-witnessed/[0.06] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Radio className="size-4 text-witnessed" /> Delivery scenarios
              </p>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                With SES, these addresses route to Amazon&apos;s mailbox simulator to exercise delivery,
                bounce and complaint events. No person reads the email. Simulator results test event handling;
                they do not measure inbox placement or whether a person read your message.
              </p>
              <p className="mt-2 text-xs font-medium text-witnessed">
                Inspect each run&apos;s provider and audit trail for the events actually received.
              </p>
            </div>

            <Scenarios recipients={recipients} />

            {sandbox ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re in the sandbox — and these runs still go out for real from here, free, up to 50 a
                day. It&apos;s the one thing the sandbox can prove about the outside world.
              </p>
            ) : null}

            {/* Where an ordinary user actually wants this: while writing. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm">
              <PenLine className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                Want to see a specific email land in your own inbox? <strong className="font-medium text-foreground">Send a
                test</strong> sits right next to Send in the composer and the template studio.
              </span>
              <Link href="/messages/new" className="font-medium hover:underline">
                Write one →
              </Link>
            </div>
          </section>

          {/* ── The loop closes: expected outcome vs what actually happened ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">What happened</h2>
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <CircleDashed className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No test sends yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Run a scenario above and it shows up here with its outcome — so you can see the promise and the
                  proof side by side.
                </p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scenario</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((m) => {
                        const def = m.test_recipient ? bySlug.get(m.test_recipient) : undefined;
                        const v = verdict(def?.outcome, m.status);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">
                              <Link href={`/messages/${m.id}`} className="hover:underline">
                                {def?.label ?? m.to}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {def ? def.outcome.replace("_", " · ") : "—"}
                            </TableCell>
                            <TableCell>
                              <MessageStatusBadge status={m.status} />
                            </TableCell>
                            <TableCell>
                              {v === "match" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-witnessed">
                                  <CheckCircle2 className="size-3.5" /> As expected
                                </span>
                              ) : v === "mismatch" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-stopped">
                                  <XCircle className="size-3.5" /> Unexpected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <CircleDashed className="size-3.5" /> In flight
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                              {relativeTime(m.created_at)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            {runs.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Bounces and complaints arrive from your provider a moment after the send — refresh if a row still
                says &ldquo;in flight&rdquo;.
              </p>
            ) : null}
          </section>

          {/* ── The developer rehearsal room, clearly labelled as such ─────── */}
          <section className="space-y-3">
            <div className="rounded-lg border border-acted/30 bg-acted/[0.05] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <FlaskConical className="size-4 text-acted" /> Sandbox
                    <span className="rounded-full border px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                      For developers
                    </span>
                  </p>
                  <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    A separate workspace with its own API keys and its own data, for wiring up an integration.
                    Mail you send there is rendered and recorded but never handed to a provider — it costs
                    nothing and can&apos;t reach anyone. If you&apos;re not calling the API, you never need it.
                  </p>
                  <p className="mt-2 text-xs font-medium text-acted">
                    Proves: your integration, templates and rendering. Not delivery — that&apos;s the section
                    above, which works from in here too.
                  </p>
                </div>
                <SandboxToggle
                  sandboxId={sandboxId}
                  liveId={liveId}
                  liveName={liveName}
                  inSandbox={sandbox}
                />
              </div>
            </div>

            {sandbox ? (
              <>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <h2 className="text-sm font-semibold">Sandbox inbox</h2>
                  <span className="text-xs text-muted-foreground">Simulated mail — rendered here, sent nowhere</span>
                </div>
                {sandboxMail.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Inbox className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">Nothing rehearsed yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      Send from this workspace — with its sandbox API key or from the composer — and the message
                      appears here in full, without leaving rootmail.
                    </p>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>To</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead className="text-right">Received</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sandboxMail.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell>
                                <MessageStatusBadge status={m.status} />
                              </TableCell>
                              <TableCell className="font-medium">
                                <Link href={`/messages/${m.id}`} className="hover:underline">
                                  {m.to}
                                </Link>
                              </TableCell>
                              <TableCell className="max-w-[320px] truncate text-muted-foreground">
                                <Link href={`/messages/${m.id}`} className="hover:underline">
                                  {m.subject}
                                </Link>
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
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </>
  );
}
