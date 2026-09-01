"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { NavIsland } from "./nav-island";
import { ThemeToggle } from "./theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { dashboardUrl, loginUrl, readSignedInHint, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

/**
 * TWO LINKS, AND THE ACTION. Owner's decision, 2026-08-31, relayed with the
 * principle behind it: *"whenever you want somebody to click on something, it
 * should be really, really obvious. You need the person to click on this thing,
 * and therefore you minimize other distractions from that particular area."*
 *
 * There were eight, and six of them were competing with `Start sending` for the
 * same pixels. `Platform` and `Features` were anchors INTO the page the reader
 * is already on — a nav entry that scrolls you is not a destination, and the
 * ids still work for anyone who has the link. `Changelog`, `Blog`, `About` and
 * `Contact` are not what a first-time visitor is deciding on; they moved to the
 * footer, which is where a reader who has read the argument looks. Nothing was
 * deleted: every page is still linked from the sign-off in `footer.tsx`.
 *
 * What is left is the one question a stranger has that this page cannot answer
 * (`Pricing`), the one audience with its own site (`Developers`), and the door.
 *
 * ── THE ISLAND (2026-09-01) ────────────────────────────────────────────────
 * NOTHING IN THIS FILE CHANGES WHAT IS IN THE NAV. Same two links, same order,
 * same destinations, same actions on the right, same mobile disclosure. The
 * standing rule in CLAUDE.md is that information architecture is the product
 * and a design pass does not get to touch it; what changed here is the shape of
 * the container and nothing else.
 *
 * The shape is the fix, though, and it was measurable. Every section on this
 * site is an inset plate — x=20, w=1225, 32px radius, its own shadow. The
 * header was x=0, w=1265, radius 0, no shadow. It was the one element on the
 * page not built out of the page's own material, which is what the owner was
 * naming as *"doing its own thing"*.
 *
 * So the bar now sits INSIDE the same `px-3 sm:px-5` gutter `<main>` gives the
 * slabs, and its left and right edges land on theirs. See `.nav-island` in
 * `globals.css` for the material and why the glass stayed.
 *
 * ── WHERE AM I? (2026-09-01) ───────────────────────────────────────────────
 * The owner: *"when I navigate to my page, it should show that I've navigated
 * to that page. Right now, even if I navigate, it's not updating… I'm not sure
 * that I'm in Pricing."* They were right and it was a plain omission: this nav
 * has never marked the current page, on any version of it. A reader on
 * /pricing saw the same bar as a reader on the homepage.
 *
 * The recess is what makes the answer obvious. `.nav-group` is a well, so the
 * current page is the one tab RAISED OUT of it — an opaque chip with its own
 * lift, which is the segmented-control idiom and is also materially honest
 * here: one lift per object, and the thing you are looking at is the thing on
 * top. It is opaque on purpose, so the label you most need to read is the one
 * cut that never composites against a moving band.
 *
 * `aria-current="page"` carries the same fact to a screen reader, which is not
 * decoration — without it the state is a colour change and nothing else.
 *
 * Matching is exact for `/pricing` rather than a prefix, because a prefix would
 * light `Pricing` up on any future `/pricing-*` route. The developer link is an
 * absolute URL to another origin and can never be current here.
 *
 * THE HEIGHT IS LOAD-BEARING AND MUST STAY 4rem. Three scroll rigs pin
 * themselves with `calc(var(--beta-notice-h, 0px) + 4rem)` — the hero deck, the
 * two card decks. That constant IS this header. The island is 3.25rem with
 * 0.375rem of air above and below it, which is 4rem exactly; change any of the
 * three and the scroll scenes start their travel in the wrong place, silently
 * and only on long pages.
 */
const links = [
  { href: "/pricing", label: "Pricing" },
  // Developers get their own site — the full pitch, code-first.
  { href: "https://developers.rootmail.io", label: "Developers" },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Reflect the signed-in state so we drop the "Sign in" wall for people who
  // already have an account — read on mount (SSR can't see the client cookie).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(readSignedInHint()), []);

  return (
    <header className="sticky top-[var(--beta-notice-h,0px)] z-50 w-full">
      {/* 0.375rem + 3.25rem + 0.375rem = 4rem. See the file note. */}
      <div className="px-3 py-1.5 sm:px-5">
        <NavIsland className="flex h-[3.25rem] items-center justify-between gap-3 pl-3 pr-2 sm:pl-4 sm:pr-3">
          <Link href="/" aria-label="rootmail home" className="shrink-0">
            <Logo />
          </Link>

          {/* The destinations, in a recess. `nav-group` is a well cut into the
              island rather than a second raised plane — one lift per object. */}
          <nav className="nav-group hidden items-center gap-0.5 p-1 md:flex">
            {links.map((l) => {
              const current = l.href === pathname;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-interaction ease-interaction",
                    current
                      ? "bg-card text-foreground shadow-e1"
                      : "text-ink-muted hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-1 md:flex">
            <ThemeToggle />
            {signedIn ? (
              <Link href={dashboardUrl} className={cn(buttonVariants({ size: "sm" }), "ml-1 gap-1.5")}>
                <LayoutDashboard className="size-4" /> Go to dashboard
              </Link>
            ) : (
              <>
                <Link href={loginUrl} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-1")}>
                  Sign in
                </Link>
                <Link href={signupUrl} className={cn(buttonVariants({ size: "sm" }))}>
                  Start sending
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full text-foreground"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </NavIsland>
      </div>

      {/* The mobile panel is its own island below the bar, positioned OUT of
          flow. In flow it would grow the header past 4rem while open and drag
          the three scroll rigs with it — on a phone, mid-scroll, invisibly. */}
      {open && (
        <div className="absolute inset-x-0 top-full px-3 pb-2 sm:px-5 md:hidden">
          <div className="nav-island flex flex-col gap-1 p-2" data-stuck="true">
            {links.map((l) => {
              const current = l.href === pathname;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-interaction ease-interaction",
                    current
                      ? "bg-card text-foreground shadow-e1"
                      : "text-ink-muted hover:bg-well hover:text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
            {signedIn ? (
              <Link
                href={dashboardUrl}
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ size: "sm" }), "mt-1 gap-1.5")}
              >
                <LayoutDashboard className="size-4" /> Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href={loginUrl}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")}
                >
                  Sign in
                </Link>
                <Link
                  href={signupUrl}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Start sending
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
