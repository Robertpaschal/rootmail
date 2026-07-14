import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReactiveCard, Reveal } from "./motion";

// The agency/platform story in plain words: send for each client from THEIR
// name, with their reputation kept separate — no jargon, no code.
const steps = [
  "Add your client's web address in the dashboard.",
  "We prepare a short list of settings — copy them to your client (or their domain provider).",
  "rootmail checks them automatically and marks the client verified.",
  "Send as your client, from their name — their reputation and history stay their own.",
];

const records = [
  { purpose: "who owns it", host: "sunsetvillas.com", value: "confirms the address is really theirs" },
  { purpose: "signature", host: "sunsetvillas.com", value: "signs every email as authentic" },
  { purpose: "permission", host: "sunsetvillas.com", value: "tells inboxes rootmail may send for them" },
];

export function SubTenancy() {
  return (
    <section className="py-20 md:py-28">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <Reveal inView>
          <Badge className="mb-4">For agencies &amp; platforms</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Send for every client — from their own name
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Run email for the businesses you serve. Each client sends from their own web address,
            with their own sending reputation — one client&apos;s mistake never touches another&apos;s
            delivery. Set up in the dashboard; no technical back-and-forth beyond pasting a few
            settings.
          </p>
          <ol className="mt-6 space-y-4">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal inView delay={0.1}>
          <ReactiveCard className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-lg">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm font-medium">Your client&apos;s setup</span>
              <span className="text-xs text-muted-foreground">sunsetvillas.com</span>
            </div>
            <div className="divide-y">
              {records.map((r) => (
                <div key={r.purpose} className="flex flex-col gap-1 py-3.5">
                  <Badge variant="muted" className="w-fit uppercase">
                    {r.purpose}
                  </Badge>
                  <span className="text-[13px] font-medium">{r.host}</span>
                  <span className="text-xs text-muted-foreground">{r.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              Everything checks out — client verified
            </div>
          </ReactiveCard>
        </Reveal>
      </div>
    </section>
  );
}
