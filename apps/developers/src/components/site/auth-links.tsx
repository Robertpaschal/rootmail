"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { dashboardUrl, loginUrl, readSignedInHint, signupUrl } from "@/lib/links";

/** Personalize links without making all public documentation request-rendered. */
export function AuthLinks() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(readSignedInHint()), []);
  return signedIn ? (
    <Link href={dashboardUrl} className={buttonVariants({ size: "sm" })}>Dashboard</Link>
  ) : (
    <>
      <Link href={loginUrl} className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
      <Link href={signupUrl} className={buttonVariants({ size: "sm" })}>Get an API key</Link>
    </>
  );
}
