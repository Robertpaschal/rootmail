import Link from "next/link";
import { ArrowRight, Shirt, Newspaper, Store, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReactiveCard, Reveal } from "./motion";

// The owner's audience doctrine, as a section: common folks first, developers
// fully served (on their own site), and everyone in between.
const personas = [
  {
    icon: Shirt,
    who: "Brands & shops",
    example: "A clothing brand",
    story:
      "Announce the new drop to your customers, and let your website send order confirmations on its own. Design everything visually; see who opened and who bought.",
  },
  {
    icon: Newspaper,
    who: "Publishers & creators",
    example: "A news desk",
    story:
      "Send the morning newsletter to subscribers, welcome new sign-ups automatically, and read replies in one inbox. No IT department required.",
  },
  {
    icon: Terminal,
    who: "People building products",
    example: "A developer, agency, or SaaS",
    story:
      "Stop hand-rolling email inside every backend. Integrate once; templates, flows and domains stay editable in the dashboard — by you or the client you built it for.",
    href: "https://developers.gateml.io",
    cta: "The developer pitch",
  },
  {
    icon: Store,
    who: "Everyone else",
    example: "If you email people, it fits",
    story:
      "A gym, a school, a two-person consultancy. If your work involves reaching people by email — transactional, marketing, or both — this is the whole toolkit.",
  },
];

export function WhoItsFor() {
  return (
    <section className="border-t border-border/60 py-20 md:py-28">
      <div className="container">
        <Reveal inView className="mx-auto mb-12 max-w-2xl text-center">
          <Badge className="mb-4">Who it&apos;s for</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Made for people. Loved by developers.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Whatever you sell, publish, or build, it&apos;s the same email platform underneath. And
            when your team has developers, they plug into the very same product from their own
            tools — one place either way.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((p, i) => (
            <Reveal key={p.who} inView delay={i * 0.08}>
              <ReactiveCard className="flex h-full flex-col rounded-2xl border bg-card p-6 transition-shadow hover:border-primary/40 hover:shadow-lg">
                <span className="mb-3 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="size-5" />
                </span>
                <h3 className="font-semibold">{p.who}</h3>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.example}</p>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.story}</p>
                {p.href ? (
                  <Link
                    href={p.href}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {p.cta} <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </ReactiveCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
