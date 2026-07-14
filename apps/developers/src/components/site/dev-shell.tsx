import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { loginUrl, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const MAIN_SITE = "https://marketing.gateml.io";

// The developer surface shares the brand but not the audience: its nav points
// at docs, live pricing, and the changelog on the MAIN site — this site's only
// job is the developer pitch.
const links = [
  { href: "#why", label: "Why rootmail" },
  { href: "#api", label: "The API" },
  { href: "#surface", label: "Everything's an endpoint" },
  { href: `${MAIN_SITE}/pricing`, label: "Pricing" },
  { href: `${MAIN_SITE}/docs`, label: "Docs" },
  { href: `${MAIN_SITE}/changelog`, label: "Changelog" },
];

export function DevNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="rootmail developers" className="flex items-center gap-2">
          <Logo />
          <span className="hidden rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
            developers
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href={loginUrl} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Sign in
          </Link>
          <Link href={signupUrl} className={cn(buttonVariants({ size: "sm" }))}>
            Get an API key
          </Link>
        </div>
      </div>
    </header>
  );
}

export function DevFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
        <p>
          © {new Date().getFullYear()} rootmail ·{" "}
          <Link href={MAIN_SITE} className="hover:text-foreground">
            not a developer? the main site speaks human <ArrowUpRight className="inline size-3.5" />
          </Link>
        </p>
        <div className="flex items-center gap-4">
          <Link href={`${MAIN_SITE}/legal/privacy`} className="hover:text-foreground">Privacy</Link>
          <Link href={`${MAIN_SITE}/legal/terms`} className="hover:text-foreground">Terms</Link>
          <Link href={`${MAIN_SITE}/legal/security`} className="hover:text-foreground">Security</Link>
          <Link href={`${MAIN_SITE}/contact`} className="hover:text-foreground">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
