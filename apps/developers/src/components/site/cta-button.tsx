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
  /** The label shown to a signed-OUT visitor (e.g. "Get an API key"). */
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
 * Keep the public page statically renderable. Only this navigation hint changes
 * after hydration; authentication is still enforced by the dashboard.
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
