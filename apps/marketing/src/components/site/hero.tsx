import Link from "next/link";
import { ArrowRight, Inbox, Megaphone, PenLine, Send, Sparkles, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./motion";
import { signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

// The main site speaks to EVERYONE — the promise is no-code first. Developers
// get their own pitch at developers.gateml.io (linked below and in the nav).
const proofs = [
  { icon: PenLine, text: "Design emails visually — no code, ever" },
  { icon: Send, text: "Receipts & resets your site sends itself" },
  { icon: Megaphone, text: "Campaigns & newsletters to your audience" },
  { icon: Inbox, text: "Replies come back to one shared inbox" },
  { icon: Sparkles, text: "An AI assistant that does the busywork" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_55%,transparent_100%)]"
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 top-[-10%] -z-10 h-[420px] w-[720px] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]"
        aria-hidden="true"
      />

      <div className="container flex flex-col items-center gap-10 py-20 text-center md:py-28">
        <Reveal className="flex max-w-3xl flex-col items-center gap-6">
          <Link href="#platform">
            <Badge variant="muted" className="py-1 pl-2.5 pr-2.5">
              Every email your business sends — one place
              <ArrowRight className="size-3" />
            </Badge>
          </Link>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            All your email.{" "}
            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              No code required.
            </span>
          </h1>

          <p className="max-w-2xl text-balance text-lg text-muted-foreground">
            The receipts your website sends, the newsletters your audience reads, and the replies
            they send back — designed, sent, and understood from one dashboard anyone can use. A
            clothing brand, a news desk, a five-person startup: if you can write an email, you can
            run rootmail.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link href={signupUrl} className={cn(buttonVariants({ size: "lg" }))}>
              Start free — no card <ArrowRight className="size-4" />
            </Link>
            <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              See pricing
            </Link>
          </div>

          <p className="text-sm text-muted-foreground">
            Free for 3,000 sends & 500 contacts a month · set up in minutes ·{" "}
            <Link
              href="https://developers.gateml.io"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Terminal className="size-3.5" /> building a product? developers.gateml.io
            </Link>
          </p>
        </Reveal>

        {/* What you can DO — plain outcomes where the code sample used to be. */}
        <Reveal delay={0.12} className="w-full max-w-3xl">
          <div className="grid gap-3 rounded-2xl border bg-card/60 p-4 backdrop-blur sm:grid-cols-2 lg:grid-cols-5 lg:gap-2 lg:p-3">
            {proofs.map((p) => (
              <div key={p.text} className="flex items-center gap-2.5 rounded-xl p-2 text-left lg:flex-col lg:items-center lg:gap-2 lg:p-3 lg:text-center">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="size-4" />
                </span>
                <span className="text-xs font-medium leading-snug text-muted-foreground">{p.text}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
