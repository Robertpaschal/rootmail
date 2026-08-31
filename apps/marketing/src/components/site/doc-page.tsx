import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

/**
 * The shell for the filed documents — `/legal/*`.
 *
 * WHAT THIS REPLACES: an `h1` at `text-3xl font-bold`, a grey subtitle, a
 * still-greyer "Last updated" line, and then 1,500 words at 14px in
 * `text-muted-foreground` with `h2`s at `text-base font-semibold` — headings a
 * shade heavier than the paragraph they introduce. A terms page a reader cannot
 * navigate is a terms page nobody reads, which is the same problem the rest of
 * this site had in a register nobody looks at.
 *
 * TWO SHAPES, and the split is the point: these pages are a *masthead* and a
 * *document*, and they should not look like one continuous flow.
 *
 *  1. The masthead sits on the bare page ground. The title at display size,
 *     then a mono strip carrying what a filed document carries — what it is,
 *     when it was last changed, who it binds. Sourcing before claim, the same
 *     order every artifact on this site uses.
 *  2. The document sits on a slab at a real reading measure (`max-w-[68ch]`),
 *     at body size in ink rather than 14px in grey, and each `h2` is a ruled
 *     section head in mono uppercase — so a reader scanning for "Sub-processors"
 *     finds it by shape rather than by reading everything above it.
 *
 * The `h2` styling is applied by descendant selector rather than by a component
 * because the five legal pages write plain `<h2>` inside their children and
 * rewriting all of them to import something would be churn for no gain.
 */
export function DocPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string;
  subtitle?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── The masthead, on the bare ground ───────────────────────────── */}
        <section className="container max-w-3xl py-12 md:py-16">
          <h1 className="display-l text-balance">{title}</h1>
          {subtitle ? <p className="lead mt-5 text-ink-muted">{subtitle}</p> : null}
          <p
            className="mt-8 border-y border-rule py-2.5 font-mono text-[12.5px] uppercase tracking-wide text-ink-muted"
            data-fact
          >
            rootmail.io · {title}
            {updated ? ` · last updated ${updated}` : ""}
          </p>
        </section>

        {/* ── The document ───────────────────────────────────────────────── */}
        <section className="slab settle">
          <div className="container max-w-3xl py-12 md:py-16">
            <div className="max-w-[68ch] space-y-5 text-[0.9375rem] leading-relaxed text-ink-muted [&_a]:font-medium [&_a]:text-brass-text [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-12 [&_h2]:border-t [&_h2]:border-rule [&_h2]:pt-5 [&_h2]:font-mono [&_h2]:text-[12.5px] [&_h2]:font-normal [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:space-y-1.5">
              {children}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
