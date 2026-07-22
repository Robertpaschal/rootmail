"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { dashboardUrl, readSignedInHint, signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "link";
type Size = "default" | "sm" | "lg" | "icon";

export interface CtaButtonProps {
  /** The label shown to a signed-OUT visitor (e.g. "Start free — no card"). */
  label: string;
  /** Where a signed-out visitor goes. Defaults to the signup page. */
  href?: string;
  /** Label once the visitor is known to be signed in. */
  signedInLabel?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Show a trailing arrow in the signed-out state (matches the old markup). */
  arrow?: boolean;
}

/**
 * A primary call-to-action that is aware of the signed-in state. Signed-out it
 * keeps its marketing label and points at signup; once the cross-subdomain
 * `rm_signed_in` hint is present it becomes a straight "Go to dashboard" link —
 * so we never show "Start free" to someone who already has an account.
 *
 * Client-side by design: reading the hint on mount keeps every marketing page
 * statically renderable (same approach as the navbar). The first paint matches
 * SSR (signed-out) and swaps after hydration for signed-in visitors.
 */
export function CtaButton({
  label,
  href = signupUrl,
  signedInLabel = "Go to dashboard",
  variant,
  size,
  className,
  arrow = false,
}: CtaButtonProps) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(readSignedInHint()), []);

  if (signedIn) {
    return (
      <Link href={dashboardUrl} className={cn(buttonVariants({ variant, size }), className)}>
        <LayoutDashboard className="size-4" /> {signedInLabel}
      </Link>
    );
  }

  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {label}
      {arrow && <ArrowRight className="size-4" />}
    </Link>
  );
}
