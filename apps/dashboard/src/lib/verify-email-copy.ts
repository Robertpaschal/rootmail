/** What the verify-email page says after the button, and where it sends people.
 * Signed-out visitors are sent to sign in — an email link is never a login. */
export function verifyOutcomeCopy(status: "verified" | "failed", signedIn: boolean) {
  if (status === "verified") {
    return signedIn
      ? { title: "Email verified", body: "Live sending is unlocked.", href: "/", cta: "Continue to dashboard →" }
      : { title: "Email verified", body: "Live sending is unlocked. Sign in to carry on where you left off.", href: "/login", cta: "Sign in →" };
  }
  return signedIn
    ? { title: "Verification failed", body: "This link is invalid, expired or already used. Resend a fresh one from the banner in your dashboard.", href: "/", cta: "Back to the dashboard →" }
    : { title: "Verification failed", body: "This link is invalid, expired or already used. Sign in and resend a fresh one from the banner.", href: "/login", cta: "Sign in →" };
}
