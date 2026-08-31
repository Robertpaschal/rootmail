import { cookies } from "next/headers";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { dashboardUrl, loginUrl, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
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
const links = [
  { href: "/#ledger", label: "The ledger" },
  { href: "/#parity", label: "Routes" },
  { href: "/docs", label: "Docs" },
  { href: `${MAIN_SITE}/pricing`, label: "Pricing" },
  { href: `${MAIN_SITE}/changelog`, label: "Changelog" },
];

export async function DevNavbar() {
  // Reflect the signed-in state (the dashboard drops a cross-subdomain hint) so
  // returning devs get a straight shot to their console instead of a Sign-in wall.
  const signedIn = (await cookies()).get("rm_signed_in")?.value === "1";
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-background/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="rootmail developers" className="flex items-center gap-2">
          <Logo />
          <span className="hidden font-mono text-[12.5px] text-ink-muted sm:inline" data-fact>
            developers
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center rounded px-3 text-sm font-medium text-ink-muted transition-colors duration-interaction ease-interaction hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
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
      </div>
    </header>
  );
}

export function DevFooter() {
  return (
    <footer className="border-t border-rule">
      {/* One row. The wrapper used to carry `mt-8 border-t pt-6` inside an
          already-bordered footer with nothing above it, which drew a second
          hairline and a 56px gap under the first — a rule separating a thing
          from nothing. */}
      <div className="container py-8">
        <div className="flex flex-col justify-between gap-4 text-sm text-ink-muted sm:flex-row">
          <p>
            © {new Date().getFullYear()} rootmail ·{" "}
            <Link href={MAIN_SITE} className="hover:text-foreground">
              rootmail.io
            </Link>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`${MAIN_SITE}/legal/privacy`} className="hover:text-foreground">
              Privacy
            </Link>
            <Link href={`${MAIN_SITE}/legal/terms`} className="hover:text-foreground">
              Terms
            </Link>
            <Link href={`${MAIN_SITE}/legal/security`} className="hover:text-foreground">
              Security
            </Link>
            <Link href={`${MAIN_SITE}/contact`} className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
