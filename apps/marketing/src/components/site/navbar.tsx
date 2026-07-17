"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { loginUrl, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

const links = [
  { href: "/#platform", label: "Platform" },
  { href: "/#features", label: "Features" },
  // Developers get their own site — the full pitch, code-first.
  { href: "https://developers.gateml.io", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
  // The freshness signal — the product ships weekly, so say so from the top nav.
  { href: "/changelog", label: "Changelog" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="rootmail home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <ThemeToggle />
          <Link href={loginUrl} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-1")}>
            Sign in
          </Link>
          <Link href={signupUrl} className={cn(buttonVariants({ size: "sm" }))}>
            Start sending
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground"
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
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
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
          </div>
        </div>
      )}
    </header>
  );
}
