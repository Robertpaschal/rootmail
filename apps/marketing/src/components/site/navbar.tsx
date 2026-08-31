"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { Logo } from "./logo";
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
 */
const links = [
  { href: "/pricing", label: "Pricing" },
  // Developers get their own site — the full pitch, code-first.
  { href: "https://developers.rootmail.io", label: "Developers" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  // Reflect the signed-in state so we drop the "Sign in" wall for people who
  // already have an account — read on mount (SSR can't see the client cookie).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(readSignedInHint()), []);

  return (
    <header className="sticky top-[var(--beta-notice-h,0px)] z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="rootmail home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center rounded px-3 text-sm font-medium text-muted-foreground transition-colors duration-interaction ease-interaction hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
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

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 md:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center rounded px-3 text-sm font-medium text-muted-foreground transition-colors duration-interaction ease-interaction hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            {signedIn ? (
              <Link
                href={dashboardUrl}
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ size: "sm" }), "mt-2 gap-1.5")}
              >
                <LayoutDashboard className="size-4" /> Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href={loginUrl}
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
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
