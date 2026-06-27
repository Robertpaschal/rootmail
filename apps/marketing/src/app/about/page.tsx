import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, MailCheck, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why rootmail exists: one email platform that's simple enough for a non-technical team and deep enough for a platform engineer — sending, replies, and proof on one data model.",
};

const audiences = [
  {
    icon: Users,
    title: "For people who just want to reach their people",
    body: "Marketers, founders, and operators get a no-code dashboard to design emails, build lists, send campaigns, automate follow-ups, and read replies — without touching code or stitching tools together.",
  },
  {
    icon: MailCheck,
    title: "For developers who want it to just work",
    body: "A clean REST API, a typed Node SDK, and a CLI expose the exact same product. Idempotent sends, webhooks, sub-tenancy, and audit trails — the primitives you'd otherwise assemble from three vendors.",
  },
];

const principles = [
  {
    icon: Layers,
    title: "One core, not three silos",
    body: "Transactional email, marketing campaigns, and sales outreach usually live in separate products you outgrow and migrate between. rootmail is a single data model that does all three — so you switch on what you need instead of re-platforming.",
  },
  {
    icon: ShieldCheck,
    title: "Deliverability and proof are the product",
    body: "Getting into the inbox and being able to prove what you sent aren't add-ons. Authentication, suppression, a reputation score, signed proof bundles, and audit trails are built in from the first send.",
  },
  {
    icon: Sparkles,
    title: "An assistant that does the work",
    body: "The built-in AI assistant drafts templates, builds sequences, sends campaigns, and diagnoses problems — “why did this bounce?” — so the hard parts of email don't require an expert on staff.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-border/60">
          <div className="container max-w-3xl py-16 text-center md:py-24">
            <Badge className="mb-4">About rootmail</Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              Email is everyone&apos;s problem. So we built it for everyone.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              Reaching the people who matter to you — customers, members, buyers, a waitlist —
              shouldn&apos;t mean wiring together one tool to send, another to follow up, and a third
              to prove it happened. rootmail is one platform that does all of it, simple enough for a
              non-technical team and deep enough for a platform engineer.
            </p>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Who it&apos;s for
              </h2>
              <p className="mt-4 text-balance text-lg text-muted-foreground">
                Most email tools pick a side — point-and-click for marketers, or an API for
                developers. rootmail serves both from the same product, on the same data.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
              {audiences.map((a) => (
                <Card key={a.title}>
                  <CardContent className="p-6">
                    <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <a.icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{a.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-secondary/30 py-16 md:py-24">
          <div className="container max-w-3xl">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                The problem we&apos;re solving
              </h2>
            </div>
            <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
              <p>
                Almost every organization sends email — receipts, welcomes, newsletters, a note to a
                customer who replied. Yet the moment you grow past the basics, email turns into a
                stack: one vendor for transactional sends, another for marketing, a third for sales
                sequences, and a spreadsheet somewhere tracking who unsubscribed. Each speaks its own
                language, none share a history, and switching between them means re-importing
                contacts and rebuilding your sender reputation from scratch.
              </p>
              <p>
                It gets worse when you send on behalf of other people. Platforms that let their own
                customers send email have to invent multi-tenant infrastructure — separate domains,
                isolated reputation, per-customer audit trails — from nothing. And anyone in a
                regulated business eventually needs to <em>prove</em> exactly what was sent and when,
                which almost no email tool can actually do.
              </p>
              <p>
                rootmail collapses that stack into one core. The same data model that delivers a
                single password-reset email scales up to give every one of your customers their own
                verified sending domain, and up again to produce cryptographically signed proof of a
                message&apos;s entire lifecycle. You never re-platform — you just turn on the next
                layer when you need it.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                What we believe
              </h2>
            </div>
            <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
              {principles.map((p) => (
                <Card key={p.title}>
                  <CardContent className="p-6">
                    <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <p.icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 pb-20 pt-4 md:pb-28">
          <div className="container">
            <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-10 text-center shadow-sm">
              <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                Where rootmail goes next
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
                We&apos;re making email infrastructure that anyone can run and trust: the assistant
                that operates it for you, deliverability you can see and improve, and proof no other
                email tool offers. If that&apos;s the kind of thing you want to build on — or build
                with us — we&apos;d love to talk.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href={signupUrl} className={cn(buttonVariants({ size: "lg" }))}>
                  Start sending <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/contact"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  Get in touch
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
