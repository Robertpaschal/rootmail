import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "./motion";

/**
 * The layer argument, made concrete.
 *
 * A visitor who already sends email needs one question answered before anything
 * else on this page matters: "I have Mailgun / SES / Postmark already — what is
 * this?" If the site reads as a competitor to replace, they leave. If it reads
 * as the thing sitting above what they already chose, they keep reading.
 *
 * So this is two columns and no cleverness: what stays exactly as it is, and
 * what you stop having to build. Every line on the right is shipped — the
 * enforcement thresholds, the per-client suppression scoping, the scoped keys,
 * the drift detection, the proof bundles. Nothing here is a roadmap item.
 */
const keep = [
  "Your sending provider — Amazon SES, Mailgun, or ours",
  "Your IP reputation and warm-up history",
  "Your domains and DNS, exactly as they are",
  "Your deliverability relationships and support contacts",
];

const add = [
  "A separate sending domain and signing keys for every client",
  "Bounce and complaint rates scored per client, not per account",
  "Automatic warn → slow down → pause on the client going wrong",
  "Suppression that knows a newsletter opt-out is not a password-reset block",
  "API keys you can hand a client that only see their own data",
  "Campaigns, sequences, a composer and a shared reply inbox",
  "Signed delivery proof anyone can verify without trusting you",
];

export function LayerModelSection() {
  return (
    <section id="layer" className="border-y bg-secondary/30 py-20 md:py-28">
      <div className="container">
        <Reveal inView className="mx-auto max-w-3xl text-center">
          <Badge className="mb-4">Already sending email?</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Keep what delivers your mail. Replace what you had to build around it.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            A sending provider gets your email delivered and tells you what happened to it. If you
            send on behalf of your own customers, everything after that — keeping them apart,
            noticing which one is going wrong, and stopping it before it costs the others — is
            yours to build. That is the part we are.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <Reveal inView delay={0.05}>
            <div className="h-full rounded-2xl border bg-card p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                What you keep
              </h3>
              <ul className="mt-4 space-y-3">
                {keep.map((k) => (
                  <li key={k} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{k}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Connect your provider in settings. Nothing about your current setup changes, and
                disconnecting puts it back.
              </p>
            </div>
          </Reveal>

          <Reveal inView delay={0.1}>
            <div className="h-full rounded-2xl border border-primary/30 bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                What you stop building
              </h3>
              <ul className="mt-4 space-y-3">
                {add.map((a) => (
                  <li key={a} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* The other audience, kept visible rather than argued with. */}
        <Reveal inView delay={0.15}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            No sending provider of your own?{" "}
            <a href="#pricing" className="font-medium text-primary underline-offset-2 hover:underline">
              We deliver it too
              <ArrowRight className="ml-0.5 inline size-3.5 align-[-2px]" />
            </a>{" "}
            — the same product, with us as the provider.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
