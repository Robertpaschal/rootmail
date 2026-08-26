import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReactiveCard, Reveal } from "./motion";

// The agency/platform story in plain words: send for each client from THEIR
// name, with their reputation measured separately AND acted on automatically.
//
// The enforcement half became true on 2026-08-18 (brief P1.1): a per-tenant
// sweep warns, then throttles, then pauses a client whose numbers go wrong. So
// "we act on it" is now a claim we can make.
//
// What is still NOT true, and must never be written here: that one client's
// mistake cannot reach another's delivery. Sub-tenants share one IP pool and one
// provider account, and enforcement only starts after a threshold is crossed —
// so some damage always precedes the throttle. "We catch it and slow it down"
// is honest; "nobody else is affected" is not. See docs/BRIEF-2026-08-18.
const steps = [
  "Add your client's web address in the dashboard.",
  "We prepare a short list of settings — copy them to your client (or their domain provider).",
  "rootmail checks them automatically and marks the client verified.",
  "Send as your client, from their name — their reputation is scored on its own, and their history stays theirs.",
  "We keep checking. If their settings ever disappear, you hear about it the same hour — not weeks later from a customer.",
];

// Answers the objection a platform buyer raises immediately: "I already send
// through Mailgun." They keep it — this sits on top.
const provider = "Works with the provider you already send through — connect your own Amazon SES or Mailgun and the mail leaves on your account, your IPs and your reputation. Or send through ours.";

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
            and every client&apos;s sending reputation is scored on its own — so you can see exactly
            which one is going wrong, before the mailbox providers tell you. When one does start
            going wrong, rootmail doesn&apos;t just show you a number: it warns you, then slows that
            client&apos;s sending, then stops it — on its own, while you sleep. Set up in the
            dashboard; no technical back-and-forth beyond pasting a few settings.
          </p>
          <p className="mt-4 rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
            {provider}
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
