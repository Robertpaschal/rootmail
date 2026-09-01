import { cookies } from "next/headers";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { dashboardUrl, loginUrl, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { NavIsland } from "./nav-island";
import { ThemeToggle } from "./theme-toggle";

const MAIN_SITE = "https://rootmail.io";

/**
 * The developer site's chrome, ported onto the design system.
 *
 * Three things changed beyond tokens. The nav pointed at `#why` and `#api`,
 * two anchors that no longer exist — the sections they named were the four
 * icon-chip cards and the tabbed code showcase, both deleted. The footer's
 * "not a developer? the main site speaks human" line is gone: it is a joke at
 * the reader's expense on a site whose own philosophy says the two front doors
 * are one product.
 *
 * AND THERE IS NO LINE LEGEND HERE, DELIBERATELY. One lived in this file for a
 * while — the four line states, drawn once per site, so the hollow `opened`
 * node in D2 had something to be read against. The owner removed it, and the
 * reasoning is worth keeping where the next person will look for it: a legend
 * you have to scroll to the footer and consult is a design that failed to
 * explain itself, and a reader who needs it has already misread the ledger. The
 * explanation lives at the point of confusion instead — the line under the
 * ledger that says what the hollow node means. Do not put it back.
 *
 * Chrome links stay monochrome (`hover:text-foreground`), matching the
 * marketing navbar. §10.2 makes brass the colour of "you can act on this", and
 * the two buttons on the right are where that lands; brass on fourteen nav and
 * footer links would spend the whole accent on furniture.
 */
/**
 * TWO LINKS, BECAUSE A FIRST-TIME DEVELOPER IS DECIDING TWO THINGS.
 *
 * This was five: `The ledger`, `Routes`, `Docs`, `Pricing`, `Changelog`. Two of
 * them (`The ledger`, `Routes`) were in-page anchors — a table of contents for a
 * page that is 5,300px long and already reads in order, so they competed with
 * the two buttons on the right for a click that had nothing to do with either.
 * `Changelog` is a returning-reader's link and it moved to the footer, which is
 * where a returning reader looks.
 *
 * What survives is what somebody who has never been here is actually choosing
 * between: read it (`Docs`) or price it (`Pricing`) — and then the one thing we
 * want pressed. The anchors still exist and still resolve; the sections did not
 * move and nothing was deleted from the page. This is the same restraint the
 * marketing nav is being cut to (Pricing · Developers · Sign in · CTA).
 */
const links = [
  // `prefix` because /docs is really /docs/<slug> — see `nav-links.tsx`.
  { href: "/docs", label: "Docs", prefix: true },
  { href: `${MAIN_SITE}/pricing`, label: "Pricing" },
] as const;

export async function DevNavbar() {
  // Reflect the signed-in state (the dashboard drops a cross-subdomain hint) so
  // returning devs get a straight shot to their console instead of a Sign-in wall.
  const signedIn = (await cookies()).get("rm_signed_in")?.value === "1";
  return (
    /* THE ISLAND — the same move as the marketing nav, for the same measured
       reason: this site's `<main>` is also a stack of inset rounded slabs and
       this header was also full-bleed and square, so it was the one element
       here not built out of the page's own material. Nothing about WHAT is in
       the nav changes. See `.nav-island` in `globals.css`.

       No `--beta-notice-h` offset and no 4rem constant on this site: nothing
       here pins a scroll rig to the header height, so the island simply floats
       at the top with air around it. */
    <header className="sticky top-0 z-40 w-full">
      <div className="px-3 py-1.5 sm:px-5">
        <NavIsland className="flex h-[3.25rem] items-center justify-between gap-3 pl-3 pr-2 sm:pl-4 sm:pr-3">
        <Link href="/" aria-label="rootmail developers" className="flex shrink-0 items-center gap-2">
          <Logo />
          <span className="hidden font-mono text-[12.5px] text-ink-muted sm:inline" data-fact>
            developers
          </span>
        </Link>
        {/* `sm:flex`, not `lg:flex`. Two links fit next to the mark and the
            buttons at 640px; the old five did not, which is why they used to
            vanish entirely on every phone and tablet.

            In a recess, like the marketing nav: one lift per object, and what
            is inside the well takes you somewhere while what is outside it
            does something. A client island because marking the current page
            needs `usePathname()` and this navbar reads `cookies()`. */}
        <NavLinks links={links} />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {signedIn ? (
            <Link href={dashboardUrl} className={cn(buttonVariants({ size: "sm" }))}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href={loginUrl} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Sign in
              </Link>
              <Link href={signupUrl} className={cn(buttonVariants({ size: "sm" }))}>
                Get an API key
              </Link>
            </>
          )}
        </div>
        </NavIsland>
      </div>
    </header>
  );
}

/**
 * The few things a reader still needs from a sign-off. The main site is first
 * because this is a subdomain and it used to be buried in the © line; the
 * changelog moved down out of the nav; the rest are the documents a reader is
 * entitled to. Five, deliberately — the same shape as the marketing footer.
 */
const FOOTER_LINKS = [
  { href: MAIN_SITE, label: "rootmail.io" },
  { href: `${MAIN_SITE}/changelog`, label: "Changelog" },
  { href: `${MAIN_SITE}/legal/privacy`, label: "Privacy" },
  { href: `${MAIN_SITE}/legal/terms`, label: "Terms" },
  { href: `${MAIN_SITE}/legal/security`, label: "Security" },
];

/**
 * THE FOOTER IS THE WORDMARK, CROPPED — the same treatment
 * `apps/marketing/src/components/site/footer.tsx` was just rebuilt to, adapted.
 *
 * What it replaces here: one 13px row — `© 2026 rootmail · rootmail.io` on the
 * left, four legal links on the right, 85px tall — which is a legal notice
 * rather than an ending. The page's last 400px were the close and then nothing.
 *
 * THE MARK. `rootmail` at display scale, cropped by the bottom of the document
 * (`-mb-[0.22em]` inside `overflow-hidden`), drawn as an OUTLINE — a
 * `-webkit-text-stroke` on transparent text — so it reads as line art pressed
 * into the paper rather than a faded logo. A stroke keeps its weight on both
 * grounds where a low-opacity fill washes out. `aria-hidden` with an `sr-only`
 * twin above it, because a logotype is a picture of a word: a screen reader
 * should hear the name once, not a stream of letters.
 *
 * ONE DELIBERATE DIVERGENCE FROM MARKETING: no CTA band inside the footer.
 * Marketing repeats its CTA pair here because the section above it is not a
 * call to action. On this page D7 IS the call to action and it sits directly
 * above this border — repeating it 120px later would not be "the way out,
 * repeated", it would be the same button twice on one screen, which is exactly
 * the distraction the close is being cleared of. The CTA still recurs at the
 * end of the page; it just recurs in the section that owns it.
 */
export function DevFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-rule bg-paper">
      <div className="container relative z-10 flex flex-col gap-6 py-12 sm:flex-row sm:items-end sm:justify-between">
        {/* The `closed beta · <year>` mono line that used to sit under this
            sentence is gone — owner's request, 2026-08-31, the same deletion
            they asked for on the marketing footer. The beta is still stated at
            the top of every page by `<BetaNotice>`; saying it again in the
            sign-off was the site apologising for itself on the way out.
            Nothing else in this footer changes: the owner likes it as it is. */}
        <p className="text-[13px] text-ink-muted">
          One call to send. Everything after it, on your webhook.
        </p>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((l) => (
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

      <span className="sr-only">rootmail</span>
      <div
        aria-hidden="true"
        className="pointer-events-none relative -mb-[0.22em] select-none px-4 text-center"
      >
        <span
          className="block font-display text-[clamp(4rem,19vw,17rem)] font-semibold leading-[0.8] tracking-[-0.04em] text-transparent"
          style={{ WebkitTextStroke: "1.5px hsl(var(--ink) / 0.22)" }}
        >
          rootmail
        </span>
      </div>
    </footer>
  );
}
