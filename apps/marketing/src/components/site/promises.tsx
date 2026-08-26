import { Inbox, Plug, ScrollText, ShieldCheck, TestTube2 } from "lucide-react";
import { Reveal } from "./motion";

/**
 * Three opinions the product already holds, that nothing on the site said.
 *
 * From the P3 half of docs/BRIEF-2026-08-18: we were under-claiming shipped
 * behaviour, which costs as much as over-claiming. Each of these is a decision
 * already enforced in code, and each is one people have been burned by
 * elsewhere — which is exactly why they are worth saying out loud.
 *
 * Every sentence here is checkable against the codebase. Nothing aspirational.
 */
const promises = [
  {
    icon: Plug,
    title: "We don't ask you to leave your provider",
    body:
      "If you already send email, you already have a reputation you built. Connect your own Amazon " +
      "SES or Mailgun and your mail keeps leaving on your account — rootmail becomes the layer above " +
      "it, not a replacement for it. Nothing about your current setup changes.",
    // POST /v1/sending-provider — credentials checked live before they're stored.
  },
  {
    icon: Inbox,
    title: "Unsubscribing stops the newsletter, not the password reset",
    body:
      "An opt-out applies to bulk mail. It can never block a receipt, a password reset, or a reply " +
      "someone is waiting on — those are not marketing, and treating them as the same list is how " +
      "people end up locked out of their own accounts.",
    // apps/worker/src/pipeline.ts — suppression is scoped by message type.
  },
  {
    icon: TestTube2,
    title: "The sandbox doesn't lie to you",
    body:
      "Test sends never touch your reputation score, and a send to a test address takes the real " +
      "path through the real provider — it is not a pretend success. A sandbox that flatters you " +
      "is worse than no sandbox, because you only find out on the day it matters.",
    // Test sends excluded from scoring; reserved test recipients take the live path.
  },
  {
    icon: ScrollText,
    title: "A data request you can answer the same day",
    body:
      "When someone asks what you hold about them — or asks you to delete it — one call returns all of " +
      "it, and one erases it. Erasing keeps their unsubscribe, because deleting that would mean emailing " +
      "them again, which is the opposite of what they asked for.",
    // POST /v1/privacy/export and /v1/privacy/erase. The suppression-survives
    // behaviour is the part worth saying: it is the detail everyone gets wrong.
  },
  {
    icon: ShieldCheck,
    title: "Proof you can hand to someone else",
    body:
      "Every message keeps a signed, independently verifiable record of what was sent, to whom, " +
      "and what happened to it — content hash included. Not a screenshot of a dashboard: something " +
      "a third party can check without taking our word for it.",
    // "Signed + independently verifiable" is true; "tamper-evident" would need a
    // hash chain, and the brief forbids that word until it exists.
  },
];

export function Promises() {
  return (
    <section className="border-y bg-muted/30 py-20 md:py-28">
      <div className="container">
        <Reveal inView>
          <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            A few things we decided on your behalf
          </h2>
          <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
            Most email problems aren&apos;t bugs — they&apos;re defaults someone chose badly. These
            are the ones we chose differently, and they aren&apos;t settings you have to find.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {promises.map((p, i) => (
            <Reveal key={p.title} inView delay={0.06 * i}>
              <div className="h-full rounded-2xl border bg-card p-6 shadow-sm">
                <p.icon className="size-6 text-primary" />
                <h3 className="mt-4 text-base font-semibold leading-snug">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
