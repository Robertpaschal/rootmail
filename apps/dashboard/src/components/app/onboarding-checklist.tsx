import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";

/**
 * Setup-progress on the Overview. Computes completion from the account's own data,
 * tells the user how much is left (steps + rough time), and calls out the steps that
 * are genuinely blocking — chiefly verifying a sending address, without which you
 * can't send from your own domain. Hides itself once everything's done; fail-quiet.
 */
interface Step {
  done: boolean;
  label: string;
  desc: string;
  href: string | null;
  minutes: number;
  /** Blocks the core job (sending from your own address) until it's done. */
  crucial?: boolean;
  /** Shown under an incomplete crucial step so "what's next" is never a mystery. */
  sub?: string[];
}

export async function OnboardingChecklist() {
  let emailVerified = false;
  let onboarded = true;
  let hasVerifiedSender = false;
  let lists = 0;
  let growthOn = false;
  let templates = 0;
  let messages = 0;
  let replyDecided = false;
  let org: { postal_address?: string | null; reply_mode?: string } | null = null;
  try {
    const [me, snd, l, t, m, organization, threads] = await Promise.all([
      api.me(),
      api.listSenders(),
      api.listLists(),
      api.listTemplates(),
      api.listMessages({ limit: 100 }),
      api.getOrganization().catch(() => null),
      api.listThreads().catch(() => ({ data: [] })),
    ]);
    emailVerified = me.user.email_verified;
    onboarded = me.onboarding_completed ?? true; // undefined (older API) → don't nag
    hasVerifiedSender = snd.data.some((s) => s.status === "verified");
    lists = l.data.length;
    growthOn = l.data.some((x) => x.signup_enabled);
    templates = t.data.length;
    messages = m.data.filter((x) => ["sent", "delivered", "bounced", "complained"].includes(x.status)).length;
    // "Done" once they've either chosen to handle replies in their own mailbox or
    // actually have a conversation flowing into the inbox.
    org = organization;
    replyDecided = org?.reply_mode === "own_mailbox" || threads.data.length > 0;
  } catch {
    return null;
  }

  /**
   * ORDER IS THE ARGUMENT HERE, and it used to be backwards.
   *
   * "Send your first email" was step 7 of 8 — behind a business profile, a
   * postal address, a contacts import, a signup widget and a template design.
   * By the checklist's own minute estimates that is ~21 minutes of
   * configuration before a single witnessed delivery: the sequence asked for
   * faith first and gave evidence last.
   *
   * `docs/design/00-PHILOSOPHY.md` §8 sets hour one: *send one real email to
   * yourself and watch the line complete.* Not a sandbox simulation — the real
   * path, the real provider, the real record. So the order is now
   *
   *   evidence (verify who you are → send one → watch it land)
   *   then reach (your own domain, an audience, growth)
   *   then craft (a design, replies)
   *
   * The MECHANICS are untouched: completion is still computed from live data,
   * `crucial` still marks what genuinely blocks, the minute estimates are still
   * honest, and it still hides itself when finished. Hrefs point at the place
   * that actually does that job (Mail compose, sender settings, onboarding or
   * the settings hub) — they do not dump every leftover step at /settings/sender.
   */
  const steps: Step[] = [
    {
      done: emailVerified,
      label: "Verify your email",
      desc: "Confirm it's you. Sending cannot start until this is done.",
      href: null,
      minutes: 1,
    },
    {
      done: messages > 0,
      label: "Send one real email and watch it land",
      desc: "To yourself, on the real path — real provider, real record. Sending is paused until this workspace has a sending identity.",
      href: "/messages/new",
      minutes: 2,
    },
    {
      done: hasVerifiedSender,
      label: "Send from your own address",
      desc: "A sending identity is required before anything can leave. Add an address and confirm it — until then, Send is paused.",
      href: "/settings/sender",
      minutes: 5,
      crucial: true,
      sub: [
        "Add your address under Settings → Sending",
        "Click the confirmation link we email to it",
      ],
    },
    {
      done: onboarded && Boolean(org?.postal_address?.trim()),
      label: "Complete your business profile",
      desc: "Your details + postal address — required by anti-spam law on any marketing mail, and used to personalize rootmail.",
      href: onboarded ? "/settings" : "/onboarding",
      minutes: 2,
    },
    {
      done: lists > 0,
      label: "Build your audience",
      desc: "Import or add the people you want to reach.",
      href: "/contacts?add=import",
      minutes: 3,
    },
    {
      done: templates > 0,
      label: "Design an email",
      desc: "Start from a layout in the studio — no code needed.",
      href: "/templates/new",
      minutes: 5,
    },
    {
      done: growthOn,
      label: "Turn on audience growth",
      desc: "Get a shareable signup page + an embeddable form, so people subscribe themselves — and a welcome sequence can greet them automatically.",
      href: "/contacts?tab=audiences",
      minutes: 2,
    },
    {
      done: replyDecided,
      label: "Set up your Replies inbox",
      desc: "When people reply, it lands here as a conversation with them — one space per contact. Pick whether replies come here or straight to your own mailbox.",
      href: "/inbox",
      minutes: 1,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // fully set up → hide

  const minutesLeft = steps.filter((s) => !s.done).reduce((sum, s) => sum + s.minutes, 0);
  const donePct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Finish setting up rootmail</CardTitle>
          <span className="text-sm text-muted-foreground">
            {doneCount}/{steps.length} done · about {minutesLeft} min left
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${donePct}%` }} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div
            key={s.label}
            className={cn(
              "flex items-start gap-3 rounded-md border bg-background p-3",
              !s.done && s.crucial && "border-acted/50 ring-1 ring-acted/20",
            )}
          >
            {s.done ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-witnessed" />
            ) : s.crucial ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-acted" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>
                  {s.label}
                </p>
                {!s.done && s.crucial ? (
                  <span className="rounded-full bg-acted-tint px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-acted">
                    Required to send
                  </span>
                ) : null}
                {!s.done ? <span className="text-[12.5px] text-muted-foreground">~{s.minutes} min</span> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              {!s.done && s.sub ? (
                <ol className="mt-1.5 space-y-0.5">
                  {s.sub.map((step, i) => (
                    <li key={step} className="flex gap-1.5 text-[12.5px] text-muted-foreground">
                      <span className="font-medium text-foreground">{i + 1}.</span> {step}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
            {!s.done && s.href ? (
              <Link
                href={s.href}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {s.crucial ? "Set up" : "Go"} <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
