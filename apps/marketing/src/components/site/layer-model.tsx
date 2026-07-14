import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReactiveCard, Reveal } from "./motion";

// The platform story in human terms: you start by sending, conversations come
// back, and when it matters you can prove everything. Same product the whole way.
const stages = [
  {
    n: 1,
    title: "Send",
    blurb:
      "Your everyday email, from your own address: the receipts and resets your website sends by itself, and the campaigns and newsletters you send on purpose.",
    points: [
      "Receipts, resets & alerts — automatic",
      "Campaigns & newsletters — on your schedule",
      "From your own name and web address",
      "People who opted out are never emailed",
    ],
  },
  {
    n: 2,
    title: "Converse",
    blurb:
      "Email isn't one-way. Replies come back into a shared inbox your team can actually answer — and automated series politely stop when someone writes back.",
    points: [
      "One inbox for every reply",
      "Answer in-app, together",
      "Welcome series stop on reply",
      "Nothing lands in a no-reply void",
    ],
  },
  {
    n: 3,
    title: "Prove",
    blurb:
      "For the day a customer disputes, a regulator asks, or a partner audits: a sealed, verifiable record of exactly what you sent, to whom, and when.",
    points: [
      "Sealed records anyone can verify",
      "The full story of every message",
      "One-click export",
      "Your data, exportable or erasable",
    ],
  },
];

export function LayerModel() {
  return (
    <section id="platform" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
      <div className="container">
        <Reveal inView className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">The platform</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Send. Converse. Prove.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Start with a single welcome email. Grow into conversations with your audience, and
            records you can stand behind — without ever moving to another tool.
          </p>
        </Reveal>

        <div className="mx-auto grid max-w-5xl gap-4">
          {stages.map((l, i) => (
            <Reveal key={l.n} inView delay={i * 0.08}>
              <ReactiveCard className="relative flex flex-col gap-5 rounded-2xl border border-primary/30 bg-card p-6 shadow-sm transition-shadow hover:shadow-lg md:flex-row md:items-start md:gap-8 md:p-8">
                <div className="flex items-center gap-4 md:w-64 md:shrink-0 md:flex-col md:items-start">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
                    {l.n}
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Step {l.n}
                    </div>
                    <h3 className="text-xl font-semibold">{l.title}</h3>
                    <div className="mt-2">
                      <Badge variant="success">
                        <Check /> Included today
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-muted-foreground">{l.blurb}</p>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {l.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ReactiveCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
