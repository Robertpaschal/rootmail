import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * The close — `docs/design/04-EXPERIENCE.md` §5.9 and §7.4, handoff 9.
 *
 * Eight sections have shown the visitor a record of somebody else's message.
 * The close is the only one that asks them for something of their own, so it is
 * the only ask on the page that is not "make an account": it points at
 * `/check`, which looks up what public DNS actually publishes about a domain
 * they name and draws the answer under the same rendering law as everything
 * above it — solid where it verified, dotted where it could not.
 *
 * That is why the primary button is not "Start free". A stranger who has just
 * watched us decline to claim an open does not want a signup form; they want to
 * see the drawing pointed at themselves. The account link stays, second.
 *
 * WHAT LEFT THIS FILE, so nobody puts it back:
 *  - the 34-word "Make an account, send one message to yourself…" paragraph;
 *  - the four-station `<Line>` above the heading — the ninth line on the page
 *    and the only one carrying no data. The checker draws real ones.
 *
 * It is `py-32` where every other section is `py-24`: the one argued exception
 * in §7.2, so the close reads as arrival rather than as a tenth station.
 */
export function Cta() {
  return (
    <section id="cta" className="slab settle ground-ink lit-edge">
      <div className="container flex max-w-2xl flex-col items-start gap-6 py-20 md:py-32">
        <h2 className="display-l text-balance">
          What does the internet actually say about your email?
        </h2>
        <p className="lead text-ink-muted">
          Name a domain. We draw what public DNS publishes about it — solid where we verified it,
          dotted where we could not.
        </p>

        <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
          no account · nothing sent · nothing stored
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/check" className={cn(buttonVariants({ size: "lg" }))}>
            Check your domain
          </Link>
          <CtaButton label="Create an account" variant="outline" size="lg" />
        </div>
      </div>
    </section>
  );
}
