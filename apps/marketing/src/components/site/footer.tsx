import Link from "next/link";
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
/**
 * The free allowance, as data rather than typed into a sentence.
 *
 * These are the shipping values — `FREE_TX_SENDS` (3,000) and the marketing
 * wing's free contact ceiling (500) in `packages/core/src/constants.ts`. They
 * are restated here rather than imported because this app is deliberately
 * standalone with no backend dependency (CLAUDE.md, "keeps the modular
 * boundary clean"), so this note is the pointer: **if the free allowance
 * changes, it changes there first and this file follows.**
 */
const FREE_SENDS_A_MONTH = "3,000";
const FREE_CONTACTS = "500";

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
      <div className="container relative z-10 flex flex-col items-center border-b border-rule py-20 text-center md:py-28">
        {/* The owner, on the old line: *"'Send one and watch the whole line' —
            what does that even mean? Is that a sensible sentence?"* It was
            house shorthand for the rendering law, which is not a sentence a
            stranger who has just met us can parse. This one asks for the
            smallest possible first step, which is what a close is for. */}
        <h2 className="display-l max-w-[16ch] text-balance">Send your first email today.</h2>

        {/* THE FIGURE IS THE STATEMENT — the treatment the owner pointed at:
            *"can we have the footer of the main marketing site have this kind
            of bold, centred [treatment] like you see in the developer site …
            we can improve the font size, the volume and all, the same way we
            have for the developer side, how it is very big and centred and
            very direct and engaging. Free for 3,000 sends and 500 contacts, no
            card — put it big and centred."*

            It was a `display-m` line and a 15px sentence at `py-14`. The
            allowance was the most persuasive thing in the band and it was set
            in the smallest type in it. `00-PHILOSOPHY.md` §10.1 withdrew "mono
            marks every recorded value" for exactly this failure — the most
            important number on a page ending up the least legible thing on it
            — and the correction is the display face AT SIZE. Presence comes
            from size and tightness, never from weight or a new colour: brass
            stays on the single button below, so the loudest thing in the band
            and the thing we want pressed are not competing. */}
        <p className="mt-10 flex flex-col items-center">
          <span className="display-num figure-rise block text-[clamp(4.5rem,14vw,9rem)] leading-[0.85] tracking-[-0.03em]">
            {FREE_SENDS_A_MONTH}
          </span>
          <span className="display-m mt-3 font-sans font-medium">sends a month, free</span>
        </p>

        {/* The other half of the owner's sentence, and no more than that.
            The contact figure is the marketing wing's meter and the send
            figure is the transactional wing's, so between them these two
            numbers ARE the free plan — which is why neither is dropped to tidy
            the band, and why nothing else is added to it. A draft of this line
            read "No card, and nothing expires": true of a free tier, and still
            a claim nobody asked for. The owner's own words are "no card". */}
        <p className="mt-5 max-w-[42ch] text-balance text-[15px] text-ink-muted">
          And {FREE_CONTACTS} contacts. No card.
        </p>

        {/* ONE control that reads as a button. The second route out is a text
            link — the same rule the developer close follows, and the reason a
            close with two large outlined buttons never feels like an arrival. */}
        <CtaButton label="Start free" size="lg" arrow className="mt-9" />
        <Link
          href="/check"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-ink-muted underline-offset-4 transition-colors duration-interaction ease-interaction hover:text-foreground hover:underline"
        >
          Check a domain first
        </Link>
      </div>

      <div className="container relative z-10 flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-ink-muted">
            One place for every email your business sends.
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
