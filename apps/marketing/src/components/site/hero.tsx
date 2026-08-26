import Link from "next/link";
import { ArrowRight, Inbox, Megaphone, PenLine, Send, Sparkles, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Parallax, ReactiveCard, Reveal } from "./motion";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

// TWO readers, both first-class, in that order — and the order matters.
//
// Most people arriving here just want their own email handled: receipts, a
// newsletter, the replies that come back. That is the whole product for them and
// the headline has to say so, or they leave before the rest lands.
//
// The second reader sends on behalf of THEIR customers, and needs to know within
// one sentence that each client stays separate. Both sentences are in the
// headline for that reason: the first is the product, the second is what makes
// it safe at the moment you are sending for other people.
//
// An earlier pass led with the platform story alone and lost the first reader
// entirely — "send for your customers" reads as an agency pitch to a bakery.
// Leading with the layer does not mean speaking only to the layer.
const proofs = [
  { icon: Send, text: "Receipts & resets your site sends itself" },
  { icon: Megaphone, text: "Campaigns & newsletters to your audience" },
  { icon: Inbox, text: "Replies land back in one shared inbox" },
  { icon: PenLine, text: "One studio to design every email" },
  { icon: Sparkles, text: "An assistant that does the busywork" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_55%,transparent_100%)]"
        aria-hidden="true"
      />
      {/* Decorative glows drift at different rates as you scroll — the parallax
          depth — and now breathe on their own so the page has a pulse before
          you've touched it. Slow (18s) and out of phase, because the point is
          that you notice it without watching it. */}
      <Parallax range={90} className="absolute left-1/2 top-[-10%] -z-10 -translate-x-1/2">
        <div
          className="h-[420px] w-[720px] max-w-[90vw] animate-aurora rounded-full bg-primary/20 blur-[130px] motion-reduce:animate-none"
          aria-hidden="true"
        />
      </Parallax>
      <Parallax range={-70} className="absolute right-[8%] top-[30%] -z-10">
        <div
          className="h-[260px] w-[260px] animate-aurora rounded-full bg-violet-500/10 blur-[100px] [animation-delay:-9s] motion-reduce:animate-none"
          aria-hidden="true"
        />
      </Parallax>

      <div className="container flex flex-col items-center gap-10 py-20 text-center md:py-28">
        <Reveal className="flex max-w-3xl flex-col items-center gap-6">
          <Link href="#platform">
            <Badge variant="muted" className="py-1 pl-2.5 pr-2.5">
              Your email, and every client's — kept apart
              <ArrowRight className="size-3" />
            </Badge>
          </Link>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            All your email in one place.{" "}
            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              Every client&apos;s, kept apart.
            </span>
          </h1>

          <p className="max-w-2xl text-balance text-lg text-muted-foreground">
            The receipts your site sends, the newsletters your audience opens and the replies they
            send back — designed, delivered and understood together. And if you send on behalf of
            your own customers, each of them gets their own sending domain, suppression list and
            reputation score, so one bad list never costs the others. Keep the email provider you
            already use, or let us deliver it. If you can write an email, you can run rootmail.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <CtaButton
              label="Start free — no card"
              size="lg"
              arrow
              className="transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
            />
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "transition-transform hover:-translate-y-0.5 active:scale-[0.98]",
              )}
            >
              See pricing
            </Link>
          </div>

          <p className="text-sm text-muted-foreground">
            Free for 3,000 sends & 500 contacts a month · set up in minutes ·{" "}
            <Link
              href="https://developers.rootmail.io"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Terminal className="size-3.5" /> building a product?
            </Link>
          </p>
        </Reveal>

        {/* What you can DO — plain outcomes where the code sample used to be. */}
        <Reveal delay={0.12} className="w-full max-w-3xl">
          <div className="grid gap-3 rounded-2xl border bg-card/60 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-5 lg:gap-2 lg:p-3">
            {proofs.map((p) => (
              <ReactiveCard
                key={p.text}
                className="flex items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-secondary/60 lg:flex-col lg:items-center lg:gap-2 lg:p-3 lg:text-center"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="size-4" />
                </span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">{p.text}</span>
              </ReactiveCard>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
