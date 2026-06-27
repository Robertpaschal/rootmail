import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Hammer, Heart, Telescope } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "rootmail is an early-stage team rebuilding email infrastructure from the ground up. We're not actively hiring yet — but if you push boundaries, we'd love to know you.",
};

const values = [
  {
    icon: Telescope,
    title: "Think from first principles",
    body: "Email is forty years of accumulated convention. We question all of it and rebuild what deserves to be rebuilt — not because it's old, but because we can do it better.",
  },
  {
    icon: Hammer,
    title: "Ship things that are real",
    body: "If we say the product does something, the code does it. No demos that don't work, no claims we can't stand behind. Truth is a feature.",
  },
  {
    icon: Compass,
    title: "Serve everyone who sends",
    body: "A founder with no engineer and a platform team with millions of customers deserve the same care. We refuse to pick one audience and abandon the other.",
  },
  {
    icon: Heart,
    title: "Sweat the unglamorous parts",
    body: "Deliverability, suppression, audit trails, proof — the work nobody brags about is exactly the work that earns trust. We do it properly.",
  },
];

export default function CareersPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            className="absolute left-1/2 top-[-20%] -z-10 h-[380px] w-[680px] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
            aria-hidden="true"
          />
          <div className="container max-w-3xl py-20 text-center md:py-28">
            <Badge className="mb-4">Careers</Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              Help us rebuild email from the ground up.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              rootmail is a small, early-stage team with an outsized ambition: make the
              infrastructure behind every email simple enough for anyone to run and trustworthy
              enough to bet a business on. It&apos;s a hard problem hiding behind a boring word, and
              that&apos;s exactly why we love it.
            </p>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container max-w-3xl">
            <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
              <p>
                Most people think email is a solved problem. It isn&apos;t. Reaching the inbox,
                proving what you sent, giving thousands of businesses their own isolated sending
                identity — these are deep, unsexy, genuinely unsolved challenges, and the tools most
                companies use paper over them rather than fix them.
              </p>
              <p>
                We&apos;re here to fix them. That takes people who are happy to go a level deeper than
                anyone asked, who can hold both a non-technical founder and a platform engineer in
                their head at once, and who&apos;d rather build the right thing than the easy thing.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-secondary/30 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                How we work
              </h2>
              <p className="mt-4 text-balance text-lg text-muted-foreground">
                We&apos;re small enough that what we value shows up in everything we build.
              </p>
            </div>
            <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
              {values.map((v) => (
                <Card key={v.title}>
                  <CardContent className="p-6">
                    <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <v.icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{v.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-2xl rounded-3xl border bg-card p-10 text-center shadow-sm">
              <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                We&apos;re not actively hiring — yet.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
                We&apos;re early, and we&apos;re deliberate about who joins. We&apos;re not posting
                roles right now, but we&apos;re always glad to meet people who push boundaries. If
                rootmail&apos;s mission resonates and you&apos;d want to build it with us one day,
                introduce yourself — tell us what you&apos;ve made and what you&apos;d want to make
                here. We read every message, and we&apos;ll reach out when the moment is right.
              </p>
              <div className="mt-8">
                <Link href="/contact" className={cn(buttonVariants({ size: "lg" }))}>
                  Introduce yourself <ArrowRight className="size-4" />
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
