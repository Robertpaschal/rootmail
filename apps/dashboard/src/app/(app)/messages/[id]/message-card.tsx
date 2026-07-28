"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Code2,
  Megaphone,
  MessageSquare,
  Paperclip,
  Send,
  User,
  Workflow,
} from "lucide-react";
import { MessageContent } from "./message-content";
import { DownloadProof } from "./download-proof";
import { CopyButton } from "@/components/app/copy-button";
import { LocalTime } from "@/components/app/local-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { STAGE_META } from "@/lib/stages";
import type { ContactDetail, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One line of the expanded header — Gmail's "show details" table. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-24 shrink-0 text-right text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/**
 * The email itself — recipient and content as ONE object, the way a mail client
 * shows it.
 *
 * The old page split this into a "Content" card and a "Recipient" card and a
 * "Details" card and a "Developer details" card, stacked in two columns. Four
 * boxes describing one email, none of them the email. This is the email: who it
 * went to at the top, the message in the middle, what rode along at the bottom
 * — with everything else folded behind the one affordance everybody already
 * knows, the header chevron.
 *
 * Depth is layered, not flattened: header → details → developer details. You
 * only ever see the layer you asked for.
 */
export function MessageCard({
  message,
  fromLabel,
  sentAt,
  deliveredAt,
  contact,
  campaign,
  sequence,
  conversationId,
  otherSends,
}: {
  message: Message;
  fromLabel: string;
  sentAt: string;
  deliveredAt?: string;
  contact: ContactDetail | null;
  campaign: { id: string; name: string } | null;
  sequence: { id: string; name: string } | null;
  conversationId: string | null;
  otherSends: { id: string; subject: string; status: string; sent_at: string | null }[];
}) {
  const [details, setDetails] = useState(false);
  const [dev, setDev] = useState(false);

  const displayName = contact?.name ?? message.to;
  const initial = (contact?.name?.trim()[0] ?? message.to[0] ?? "?").toUpperCase();

  // Where this send came from, in one phrase — the same fact the details panel
  // repeats formally, but readable at a glance.
  const origin = campaign
    ? { icon: Megaphone, label: "Campaign", value: campaign.name, href: `/campaigns/${campaign.id}` }
    : sequence
      ? { icon: Workflow, label: "Sequence", value: sequence.name, href: `/sequences/${sequence.id}` }
      : { icon: Send, label: "One-to-one", value: "Direct send", href: null };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* ── Header: who it went to, when, and the way into everything else ── */}
        <div className="flex items-start gap-3 px-5 py-4">
          {contact ? (
            <Link
              href={`/contacts/${contact.id}`}
              title="Open their record"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-transform hover:scale-105"
            >
              {initial}
            </Link>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
              <User className="size-4" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold">To {displayName}</span>
              {contact ? (
                <Badge className={cn("border-transparent", STAGE_META[contact.stage].badge)}>
                  {STAGE_META[contact.stage].label}
                </Badge>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setDetails((v) => !v)}
              aria-expanded={details}
              className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">
                from {fromLabel}
                {contact?.name ? ` · ${message.to}` : ""}
              </span>
              <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", details && "rotate-180")} />
            </button>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground" title={sentAt}>
              <LocalTime iso={sentAt} />
            </p>
            {message.sandbox ? (
              <Badge variant="warning" className="mt-1">
                Sandbox
              </Badge>
            ) : null}
          </div>
        </div>

        {/* ── Details, on the chevron. Everything a person might reasonably ask
             about this email, then the developer layer inside it. ────────── */}
        <AnimatePresence initial={false}>
          {details ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <dl className="mx-5 mb-4 rounded-lg bg-muted/40 p-3 text-xs">
                <Field label="from">{fromLabel}</Field>
                {message.reply_to ? <Field label="reply-to">{message.reply_to}</Field> : null}
                <Field label="to">{message.to}</Field>
                <Field label="date">
                  <LocalTime iso={sentAt} />
                </Field>
                {deliveredAt ? (
                  <Field label="delivered">
                    <LocalTime iso={deliveredAt} />
                  </Field>
                ) : null}
                {message.scheduled_at ? (
                  <Field label="scheduled">
                    <LocalTime iso={message.scheduled_at} />
                  </Field>
                ) : null}
                <Field label="subject">{message.subject || "(no subject)"}</Field>
                <Field label="sent as">
                  <span className="capitalize">{message.type}</span>
                  {origin.href ? (
                    <>
                      {" · "}
                      <Link href={origin.href} className="text-primary hover:underline">
                        {origin.value}
                      </Link>
                    </>
                  ) : (
                    ` · ${origin.value}`
                  )}
                </Field>
                {message.template_id ? (
                  <Field label="template">
                    {message.template_id}
                    {message.template_version ? ` · v${message.template_version}` : ""}
                  </Field>
                ) : null}

                {/* The developer layer — inside details, never above it. */}
                <div className="mt-2 border-t pt-2">
                  <button
                    type="button"
                    onClick={() => setDev((v) => !v)}
                    aria-expanded={dev}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Code2 className="size-3.5" />
                    Developer details
                    <ChevronDown className={cn("size-3.5 transition-transform", dev && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {dev ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-2 font-mono">
                          <Field label="message id">
                            <span className="inline-flex items-center gap-1">
                              {message.id}
                              <CopyButton value={message.id} />
                            </span>
                          </Field>
                          {message.idempotency_key ? (
                            <Field label="idempotency">{message.idempotency_key}</Field>
                          ) : null}
                          <Field label="priority">{message.priority}</Field>
                          {message.provider ? <Field label="provider">{message.provider}</Field> : null}
                          {message.provider_message_id ? (
                            <Field label="provider id">{message.provider_message_id}</Field>
                          ) : null}
                          {message.content_hash ? (
                            <Field label="content hash">{message.content_hash.slice(0, 24)}…</Field>
                          ) : null}
                          {message.sub_tenant_id ? (
                            <Field label="client">
                              <Link href={`/sub-tenants/${message.sub_tenant_id}`} className="text-primary hover:underline">
                                {message.sub_tenant_id}
                              </Link>
                            </Field>
                          ) : null}
                          {message.tags.length > 0 ? <Field label="tags">{message.tags.join(", ")}</Field> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 font-sans">
                          <DownloadProof messageId={message.id} />
                          <Link href="/docs" className="text-xs text-primary hover:underline">
                            Developer docs
                          </Link>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </dl>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── The message ─────────────────────────────────────────────────── */}
        <div className="border-t px-5 py-4">
          <MessageContent html={message.rendered_html} text={message.rendered_text} />
        </div>

        {/* ── What rode along ─────────────────────────────────────────────── */}
        {message.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t px-5 py-3">
            {message.attachments.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Paperclip className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{a.filename}</span>
                <span className="text-muted-foreground">{fmtSize(a.size)}</span>
              </a>
            ))}
          </div>
        ) : null}

        {/* ── What you'd do next ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-muted/20 px-5 py-3">
          {conversationId ? (
            <Link
              href={`/inbox/${conversationId}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <MessageSquare className="size-4" /> Open conversation
            </Link>
          ) : (
            <Link
              href={`/messages/new?to=${encodeURIComponent(message.to)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Send className="size-4" /> Email them again
            </Link>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <origin.icon className="size-3.5" />
            {origin.href ? (
              <Link href={origin.href} className="hover:text-foreground hover:underline">
                {origin.label} · {origin.value}
              </Link>
            ) : (
              <>{origin.value}</>
            )}
          </span>
        </div>

        {/* ── The person this reached, and the rest of their history ──────── */}
        {contact ? (
          <div className="border-t px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                More to {contact.name ?? contact.email}
              </p>
              <Link
                href={`/contacts/${contact.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Their full record <ArrowRight className="size-3" />
              </Link>
            </div>
            {otherSends.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {otherSends.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/messages/${m.id}`}
                      className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-secondary/60"
                    >
                      <span className="min-w-0 flex-1 truncate">{m.subject || "(no subject)"}</span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">{m.status}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(m.sent_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">This is the only email you&apos;ve sent them.</p>
            )}
          </div>
        ) : (
          <div className="border-t px-5 py-3 text-sm text-muted-foreground">
            {message.to} isn&apos;t in your audience yet —{" "}
            <Link href="/contacts" className="text-primary hover:underline">
              add them
            </Link>{" "}
            to keep their history in one place.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
