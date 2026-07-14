import {
  ArrowLeftRight,
  BarChart3,
  Fingerprint,
  Gauge,
  MessagesSquare,
  Network,
  ScrollText,
  Send,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReactiveCard, Reveal } from "./motion";

// Outcomes, not mechanisms — every card says what YOU get, in plain words.
// (The mechanisms live on developers.gateml.io, where they're the point.)
const features = [
  {
    icon: Send,
    title: "Every kind of email",
    desc: "Order confirmations, password resets, newsletters, launch announcements — write them once, send them when you want, from your own address.",
  },
  {
    icon: Fingerprint,
    title: "Never sent twice",
    desc: "Hiccups happen — a page reloads, a system retries. Your customer still gets exactly one copy. Always.",
  },
  {
    icon: Network,
    title: "Send for your clients",
    desc: "Agencies and platforms can send from each client's own name and web address, with every client's sending reputation kept separate.",
  },
  {
    icon: Gauge,
    title: "Land in the inbox",
    desc: "A live 0–100 reputation score from your real results, and we prepare the technical records your domain needs — you just paste them in once.",
  },
  {
    icon: BarChart3,
    title: "See what gets read",
    desc: "Sent, delivered, opened, clicked — for everything you send, and for each campaign or welcome series on its own.",
  },
  {
    icon: Workflow,
    title: "Welcomes on autopilot",
    desc: "Greet every new subscriber with a series that sends itself over days — and stops the moment someone writes back.",
  },
  {
    icon: MessagesSquare,
    title: "Replies come back to you",
    desc: "Answers land in one shared inbox your whole team can see — not a no-reply void.",
  },
  {
    icon: ShieldCheck,
    title: "Prove what you sent",
    desc: "When it matters — a dispute, an audit — export a sealed, verifiable record of exactly what went out and when.",
  },
  {
    icon: ScrollText,
    title: "A full paper trail",
    desc: "Every step of every email is recorded and can never be quietly edited. Look any message up, any time.",
  },
  {
    icon: ShieldOff,
    title: "Consent, handled",
    desc: "Unsubscribes, bounces, and complaints are respected automatically before every send — you can't accidentally email someone who opted out.",
  },
  {
    icon: ArrowLeftRight,
    title: "Switch without losing anything",
    desc: "Bring your contacts and your do-not-email list straight over from Mailchimp-style exports — your history and reputation come with you.",
  },
  {
    icon: Sparkles,
    title: "An assistant that does the busywork",
    desc: "Ask in plain English — “set up a welcome series”, “why did this bounce?” — and it builds, fixes, and reports back.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="container">
        <Reveal inView className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">What you get</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your email needs to just work
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Use what you need today; the rest is there the day you want it. No plugins, no add-on
            tools, no “talk to IT”.
          </p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} inView delay={(i % 3) * 0.07}>
              <ReactiveCard>
                <Card className="h-full transition-shadow hover:border-primary/40 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <f.icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              </ReactiveCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
