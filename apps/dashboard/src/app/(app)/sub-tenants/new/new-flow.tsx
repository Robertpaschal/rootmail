"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Network,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { createSubTenantStaged, verifySubTenantStaged } from "../actions";
import { CopyButton } from "@/components/app/copy-button";
import { StageRail, StageScene, type Stage } from "@/components/app/stage-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubTenant } from "@/lib/types";

/**
 * Adding a client domain, as a journey rather than a form.
 *
 * The old page showed a three-card "how it works" explainer and then opened the
 * create form UNDERNEATH it. So the steps were decoration: they described a
 * process the UI didn't actually walk you through, and everything after step 1
 * (publish DNS, verify) happened somewhere else entirely, after a redirect.
 *
 * Here the three steps ARE the flow. You add the domain, the records you have to
 * publish appear in place, and verification happens in front of you — same rail
 * the composer and campaign launch use, so a multi-step job feels the same
 * everywhere in the app.
 */

const STAGES: Stage[] = [
  { id: "add", label: "Add the domain", hint: "Who the client is, and the domain their mail will come from." },
  { id: "dns", label: "Publish DNS", hint: "Add these records at the domain's DNS host — copy each one across." },
  { id: "verify", label: "Verify & send", hint: "We check the records resolve, then the domain goes live." },
];

export function NewClientDomainFlow({ mockDns }: { mockDns: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [dir, setDir] = useState(1);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [externalId, setExternalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<SubTenant | null>(null);
  const [notYet, setNotYet] = useState(false);
  const [pending, start] = useTransition();

  const go = (next: number) => {
    setDir(next > stage ? 1 : -1);
    setStage(next);
    setFurthest((f) => Math.max(f, next));
  };

  const create = () => {
    setError(null);
    start(async () => {
      const res = await createSubTenantStaged({ name, sending_domain: domain, external_id: externalId });
      if (res.error) return setError(res.error);
      if (res.subTenant) {
        setTenant(res.subTenant);
        go(1);
      }
    });
  };

  const verify = () => {
    if (!tenant) return;
    setError(null);
    setNotYet(false);
    start(async () => {
      const res = await verifySubTenantStaged(tenant.id);
      if (res.error) return setError(res.error);
      if (res.subTenant) {
        setTenant(res.subTenant);
        if (res.subTenant.status !== "verified") setNotYet(true);
      }
    });
  };

  const verified = tenant?.status === "verified";
  const records = tenant?.dns_records ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <StageRail
        stages={STAGES}
        current={stage}
        furthest={furthest}
        onJump={(i) => go(i)}
        className="mb-6"
      />

      <AnimatePresence mode="wait" initial={false}>
        {stage === 0 ? (
          <StageScene keyId="add" direction={dir}>
            <div className="rounded-xl border bg-card p-6">
              <span className="inline-grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Network className="size-5" />
              </span>
              <h2 className="mt-3 text-lg font-semibold">Whose domain are we setting up?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Their mail will send from this domain, signed with its own DKIM key — and this client&apos;s
                bounces and complaints are scored separately, so a bad week shows up against the client
                that caused it.
              </p>

              <div className="mt-5 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Client name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sunset Villas"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">Just for you — how they&apos;ll appear in your list.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="domain">Sending domain</Label>
                  <Input
                    id="domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="news.sunsetvillas.com"
                    className="font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && name.trim() && domain.trim()) create();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    A subdomain is the usual choice — it keeps this sending separate from the client&apos;s
                    everyday email.
                  </p>
                </div>
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                    Track this against your own records? <span className="underline">Add an external ID</span>
                  </summary>
                  <div className="mt-2 grid gap-2">
                    <Input
                      value={externalId}
                      onChange={(e) => setExternalId(e.target.value)}
                      placeholder="customer_8821"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your own id for this client, echoed back on every API response.
                    </p>
                  </div>
                </details>
              </div>

              <ErrorLine error={error} reduce={reduce} />

              <div className="mt-6 flex items-center justify-between">
                <Link
                  href="/sub-tenants"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" /> Cancel
                </Link>
                <Button onClick={create} disabled={pending || !name.trim() || !domain.trim()}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create &amp; get DNS records <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </StageScene>
        ) : null}

        {stage === 1 && tenant ? (
          <StageScene keyId="dns" direction={dir}>
            <div className="rounded-xl border bg-card p-6">
              <span className="inline-grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="size-5" />
              </span>
              <h2 className="mt-3 text-lg font-semibold">
                Publish these at {tenant.sending_domain}&apos;s DNS host
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Whoever manages the domain — you or the client — adds each record exactly as shown. It&apos;s
                the same place you&apos;d add records for Google Workspace or a website.
              </p>

              <div className="mt-5 space-y-3">
                {records.map((r, i) => (
                  <motion.div
                    key={`${r.purpose}-${r.host}`}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduce ? { duration: 0 } : { delay: i * 0.05, duration: 0.2 }}
                    className="rounded-lg border p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="muted" className="uppercase">{r.purpose}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{r.type}</span>
                      {r.required ? <span className="text-xs text-muted-foreground">· required</span> : null}
                    </div>
                    <Field label="Name / host" value={r.host} />
                    <Field label="Value" value={r.value} muted />
                  </motion.div>
                ))}
                {records.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No records came back for this domain. Open it from the list and try verifying there.
                  </p>
                ) : null}
              </div>

              <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                DNS changes usually appear within minutes, but some hosts take a few hours. You can leave and
                come back — the domain is saved, and it&apos;s waiting for you under Client domains.
              </p>

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => go(0)}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" /> Back
                </button>
                <Button onClick={() => go(2)}>
                  I&apos;ve added them <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </StageScene>
        ) : null}

        {stage === 2 && tenant ? (
          <StageScene keyId="verify" direction={dir}>
            <div className="rounded-xl border bg-card p-6 text-center">
              <AnimatePresence mode="wait" initial={false}>
                {verified ? (
                  <motion.div
                    key="done"
                    initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 24 }}
                  >
                    <span className="inline-grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <PartyPopper className="size-6" />
                    </span>
                    <h2 className="mt-3 text-lg font-semibold">{tenant.sending_domain} is live</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      The records check out. Mail for {tenant.name} now sends under their own domain, with its
                      reputation kept separate from everyone else&apos;s.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <Button onClick={() => router.push(`/sub-tenants/${tenant.id}`)}>
                        Open {tenant.name} <ArrowRight className="size-4" />
                      </Button>
                      <Link
                        href="/sub-tenants"
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Back to client domains
                      </Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="checking"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="inline-grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <ShieldCheck className="size-6" />
                    </span>
                    <h2 className="mt-3 text-lg font-semibold">Let&apos;s check the records</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      We&apos;ll look up {tenant.sending_domain} and confirm the DKIM and SPF records are
                      there.
                      {mockDns ? " (This environment auto-passes verification.)" : ""}
                    </p>

                    <AnimatePresence initial={false}>
                      {notYet ? (
                        <motion.p
                          key="notyet"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={reduce ? { duration: 0 } : { duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <span className="mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 dark:text-amber-400">
                            <Clock className="mt-0.5 size-3.5 shrink-0" />
                            Not showing up yet. DNS can take a while to spread — give it a few minutes and
                            check again, or double-check the records on the previous step.
                          </span>
                        </motion.p>
                      ) : null}
                    </AnimatePresence>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <Button onClick={verify} disabled={pending}>
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        {pending ? "Checking…" : notYet ? "Check again" : "Check the records"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => go(1)}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Back to the records
                      </button>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      In no rush?{" "}
                      <Link href="/sub-tenants" className="text-primary hover:underline">
                        Finish later
                      </Link>{" "}
                      — {tenant.name} is saved and will be waiting.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <ErrorLine error={error} reduce={reduce} />
            </div>
          </StageScene>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <code
        className={`min-w-0 flex-1 truncate font-mono text-xs ${muted ? "text-muted-foreground" : ""}`}
        title={value}
      >
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}

function ErrorLine({ error, reduce }: { error: string | null; reduce: boolean | null }) {
  return (
    <AnimatePresence initial={false}>
      {error ? (
        <motion.p
          key="err"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2 }}
          className="overflow-hidden text-sm text-destructive"
        >
          <span className="mt-3 block">{error}</span>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/** Re-exported for the empty state, so the list page can show the same steps. */
export const CLIENT_DOMAIN_STEPS = STAGES.map((s, i) => ({
  n: i + 1,
  label: s.label,
  hint: s.hint,
  icon: [Network, KeyRound, CheckCircle2][i],
}));
