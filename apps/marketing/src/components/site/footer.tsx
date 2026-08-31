import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * The footer is the wordmark, cropped.
 *
 * It used to be a four-column corporate sitemap — 21 links across Platform,
 * Developers, Company and Legal — which is the footer of a company with
 * departments. We are a closed beta. A directory that large also competes with
 * the top nav for the same job while implying a size we have not earned.
 *
 * So: everything that matters is in the top nav, everything else lives on the
 * page it belongs to, and this is a sign-off rather than a second navigation.
 *
 * THE MARK. `rootmail` is set at display scale and deliberately cropped by the
 * bottom of the page, so you read the top half of the letterforms and your eye
 * completes the rest. It is drawn in the page's own ink at low opacity — a
 * watermark pressed into the paper, not a banner laid on top — which is why it
 * sits BEHIND the last rule and never competes with the content above it.
 *
 * It is drawn as an OUTLINE — `text-transparent` with a `-webkit-text-stroke`
 * — so you read the silhouette of the letterforms rather than a solid tint.
 * A filled watermark reads as a faded logo; the outline reads as line art, and
 * it holds its edge on both grounds because a stroke keeps its weight where a
 * low-opacity fill washes out on light paper.
 *
 * It is `aria-hidden` and duplicated as a real, invisible-to-sight label,
 * because a logotype is an image of a word: a screen reader should hear the
 * company name once, not a stream of letters, and never lose it because we
 * chose to crop the glyphs.
 */
/**
 * How to reach a human, what the company is, and the documents a reader is
 * entitled to.
 *
 * `Blog`, `Changelog` and `About` arrived here on 2026-08-31 when the top nav
 * was cut to `Pricing` and `Developers` (see `navbar.tsx` for the reasoning).
 * They are things a reader looks for AFTER the argument, not before it, which
 * is exactly what a sign-off is for. This is still a sign-off and not the
 * four-column, 21-link corporate sitemap it replaced — the test is that every
 * entry is either a person, an identity, or a legal document.
 */
const LINKS = [
  { href: "/contact", label: "Talk to us" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/changelog", label: "Changelog" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/security", label: "Security" },
];

export function Footer() {
  return (
    <footer className="relative mt-6 overflow-hidden border-t border-rule bg-paper">
      {/* The way out, repeated. Somebody who has read to the bottom has read
          the argument; making them scroll back up to act on it is the one
          navigation failure a footer can actually cause. Measured on the
          references the owner pointed at: the CTA pair recurs near the end of
          the page, not only in the header. */}
      <div className="container relative z-10 flex flex-col items-center gap-5 border-b border-rule py-14 text-center">
        <p className="display-m max-w-[18ch] text-balance">Send one, and watch the whole line.</p>
        <p className="max-w-[46ch] text-[15px] text-ink-muted">
          Free for 3,000 sends and 500 contacts a month. No card.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <CtaButton label="Start free" size="lg" arrow />
          <Link href="/check" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Check a domain
          </Link>
        </div>
      </div>

      <div className="container relative z-10 flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-ink-muted">
            Every email you send, and a record of what happened to it.
          </p>
          <p className="font-mono text-[12px] text-ink-muted" data-fact>
            closed beta · {new Date().getFullYear()}
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center text-[13px] text-ink-muted underline-offset-4 transition-colors duration-interaction ease-interaction hover:text-foreground hover:underline"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="mailto:hello@rootmail.io"
            className="inline-flex min-h-11 items-center text-[13px] text-brass-text underline-offset-4 transition-colors duration-interaction ease-interaction hover:underline"
          >
            hello@rootmail.io
          </a>
        </nav>
      </div>

      {/* The cropped wordmark. `select-none` and `aria-hidden` because it is a
          picture of the name; the accessible name is provided above it. The
          negative bottom margin is what does the cropping — the glyphs run past
          the end of the document and the page cuts them. */}
      <span className="sr-only">rootmail</span>
      <div
        aria-hidden="true"
        className="pointer-events-none relative -mb-[0.22em] select-none px-4 text-center"
      >
        <span
          className="block font-display text-[clamp(4rem,19vw,17rem)] font-semibold leading-[0.8] tracking-[-0.04em] text-transparent"
          style={{
            // The outline. A stroke rather than a low-opacity fill: it keeps a
            // consistent weight on both the ivory and the near-black ground,
            // where a 7% fill would simply disappear on paper.
            WebkitTextStroke: "1.5px hsl(var(--ink) / 0.22)",
          }}
        >
          rootmail
        </span>
      </div>
    </footer>
  );
}
