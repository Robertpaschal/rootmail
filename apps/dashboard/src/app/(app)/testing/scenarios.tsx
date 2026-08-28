"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  Copy,
  Loader2,
  Mail,
  MailX,
  Moon,
  Play,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { runTestSend, resetTestRecipients } from "./actions";
import { Button } from "@/components/ui/button";
import type { TestRecipient } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<TestRecipient["outcome"], typeof Mail> = {
  delivered: Mail,
  bounced: MailX,
  complained: ShieldAlert,
  suppressed: Ban,
  delivered_ooto: Moon,
};

/** Colour carries the meaning: green = good, red = failure you asked for. */
const TONES: Record<TestRecipient["outcome"], string> = {
  delivered: "text-witnessed bg-witnessed/10",
  bounced: "text-stopped bg-stopped/10",
  complained: "text-stopped bg-stopped/10",
  suppressed: "text-acted bg-acted/10",
  delivered_ooto: "text-muted-foreground bg-ink/10",
};

const OUTCOME_LABEL: Record<TestRecipient["outcome"], string> = {
  delivered: "Delivered",
  bounced: "Hard bounce",
  complained: "Spam complaint",
  suppressed: "Suppressed",
  delivered_ooto: "Delivered · auto-reply",
};

function CopyAddress({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        void navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted"
      title="Copy address"
    >
      <span className="truncate">{email}</span>
      {copied ? <Check className="size-3 shrink-0 text-witnessed" /> : <Copy className="size-3 shrink-0" />}
    </button>
  );
}

/**
 * The scenario board. Each card is a claim about your setup ("a hard bounce is
 * recorded and the address is suppressed") and a button that proves it — with a
 * real send, on the real path, to an address that can't be harmed.
 */
export function Scenarios({ recipients }: { recipients: TestRecipient[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetting, startReset] = useTransition();

  const run = async (r: TestRecipient) => {
    setBusy(r.slug);
    setError(null);
    setResetMsg(null);
    const err = await runTestSend({ to: r.email, label: r.label });
    setBusy(null);
    if (err) return setError(err);
    setDone(r.slug);
    setTimeout(() => setDone(null), 5000);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pick what you want to prove</h2>
        <button
          type="button"
          disabled={resetting}
          onClick={() =>
            startReset(async () => {
              const res = await resetTestRecipients();
              setResetMsg(
                "error" in res
                  ? res.error
                  : res.cleared === 0
                    ? "Nothing to clear — all scenarios are ready to run."
                    : `Cleared ${res.cleared} test suppression${res.cleared === 1 ? "" : "s"}.`,
              );
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
          title="Bounce and complaint tests suppress the address — clear them to run again"
        >
          {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Reset test addresses
        </button>
      </div>

      <AnimatePresence>
        {resetMsg ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-muted-foreground"
          >
            {resetMsg}
          </motion.p>
        ) : null}
        {error ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertTriangle className="size-3.5 shrink-0" /> {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {recipients.map((r) => {
          const Icon = ICONS[r.outcome] ?? Mail;
          return (
            <motion.div
              key={r.slug}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", TONES[r.outcome])}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{r.label}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{r.description}</p>
                </div>
              </div>

              <CopyAddress email={r.email} />

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Ends as <span className="text-foreground">{OUTCOME_LABEL[r.outcome]}</span>
                </span>
                <Button
                  size="sm"
                  variant={done === r.slug ? "secondary" : "outline"}
                  disabled={busy != null}
                  onClick={() => void run(r)}
                  className="h-7 px-2.5 text-xs"
                >
                  {busy === r.slug ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Sending
                    </>
                  ) : done === r.slug ? (
                    <>
                      <Check className="size-3.5 text-witnessed" /> Sent
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" /> Run
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="pt-1 text-xs text-muted-foreground">
        Every run is a real send: it uses a transactional send from your plan, is signed with your DKIM key, and
        fires your webhooks.{" "}
        <Link href="/webhooks" className="font-medium text-foreground hover:underline">
          Watch it arrive <ArrowRight className="inline size-3" />
        </Link>
      </p>
    </div>
  );
}
