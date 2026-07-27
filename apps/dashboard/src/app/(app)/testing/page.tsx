import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleDashed, FlaskConical, Inbox, Radio, XCircle } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { MessageStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message, MessageStatus, TestRecipient } from "@/lib/types";
import { Scenarios } from "./scenarios";

export const metadata: Metadata = { title: "Testing" };

/**
 * Testing — proving things work before real people are involved.
 *
 * Two lanes, deliberately distinct:
 *  • **Test recipients** take the REAL send path (real DKIM, real provider, real
 *    webhooks) to a mailbox simulator that reaches no person and is excluded from
 *    sender reputation. This is the lane that proves delivery, and it works from
 *    the sandbox *and* from live.
 *  • **The sandbox workspace** is the free rehearsal: everything else you send
 *    there is simulated and stays inside rootmail, so you can wire up an
 *    integration without spending sends or risking a real inbox.
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
  let recipients: TestRecipient[] = [];
  let runs: Message[] = [];
  let sandboxMail: Message[] = [];
  let sandbox = false;
  let failed: string | null = null;
  let isApiErr = false;

  try {
    const [cat, me] = await Promise.all([api.listTestRecipients(), api.me().catch(() => null)]);
    recipients = cat.data;
    sandbox = (me?.active_workspace ?? me?.workspaces?.[0])?.environment === "test";
    const [tests, sbx] = await Promise.all([
      api.listMessages({ test: true, limit: 20 }),
      sandbox ? api.listMessages({ sandbox: true, limit: 20 }) : Promise.resolve({ data: [] as Message[] }),
    ]);
    runs = tests.data;
    // The sandbox inbox is everything else you rehearsed here — test-recipient
    // runs have their own table above, so don't show them twice.
    sandboxMail = sbx.data.filter((m) => !m.test_recipient);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  const bySlug = new Map(recipients.map((r) => [r.slug, r]));

  return (
    <>
      <PageHeader
        title="Testing"
        description="Prove your email works — for real — before a single customer is involved."
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : (
        <div className="space-y-8">
          {/* What each lane actually proves. No hand-waving: the sandbox can't
              prove delivery, and we say so. */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Radio className="size-4 text-emerald-600 dark:text-emerald-400" /> Test recipients — the real path
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Mail to these addresses is signed with your DKIM key, handed to your sending provider, and reported
                back through your webhooks — exactly like customer mail. It lands on the provider&apos;s mailbox
                simulator, so no person receives it and your sending reputation is untouched, even when you
                deliberately trigger a hard bounce.
              </p>
              <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Proves: delivery, DKIM signing, bounce &amp; complaint handling, auto-suppression, webhooks.
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <FlaskConical className="size-4 text-amber-600 dark:text-amber-400" /> Sandbox — the free rehearsal
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                A separate workspace with its own keys and its own data. Mail you send there is rendered and
                recorded but never handed to a provider, so it costs nothing and can&apos;t reach anyone — wire up
                an integration, get the payloads right, break things freely.
              </p>
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                Proves: your integration, templates and rendering. Not delivery — that&apos;s the lane on the left.
              </p>
            </div>
          </div>

          {sandbox ? (
            <p className="-mt-4 text-sm text-muted-foreground">
              You&apos;re in the sandbox. Test-recipient runs still go out for real from here (up to 50 a day, free)
              — that&apos;s the one thing the sandbox can prove about the outside world.
            </p>
          ) : null}

          <Scenarios recipients={recipients} />

          {/* The loop closes here: expected outcome vs what actually happened. */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">What happened</h2>
            {runs.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
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
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="size-3.5" /> As expected
                                </span>
                              ) : v === "mismatch" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
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

          {/* Sandbox-only: the rehearsal inbox. */}
          {sandbox ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Sandbox inbox</h2>
                <span className="text-xs text-muted-foreground">Simulated mail — rendered here, sent nowhere</span>
              </div>
              {sandboxMail.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
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
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
