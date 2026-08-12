// The customer dashboard is a separate app/origin. Marketing only links to it.
// Override per environment with NEXT_PUBLIC_DASHBOARD_URL (e.g. http://localhost:3001
// in local dev); defaults to the intended production origin.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.rootmail.io";

/**
 * Where "Get started" goes.
 *
 * While the beta is closed, every CTA on this site would otherwise land a
 * stranger on a form that refuses them — the worst possible first impression,
 * and one we'd never see ourselves because we all have codes. So they go to the
 * waitlist instead. Flip NEXT_PUBLIC_BETA_CLOSED to "false" on the day we open
 * and every button on the site changes with it.
 */
const BETA_CLOSED = (process.env.NEXT_PUBLIC_BETA_CLOSED ?? "true") !== "false";
export const signupUrl = BETA_CLOSED ? "/beta" : `${DASHBOARD_URL}/signup`;
export const loginUrl = `${DASHBOARD_URL}/login`;
/** Where a signed-in visitor goes (root redirects to their overview). */
export const dashboardUrl = DASHBOARD_URL;

/** The cross-subdomain "signed-in" hint the dashboard drops (see apps/dashboard
 * session.ts). Non-secret; lets marketing swap the Sign-in wall for a Dashboard
 * button. `undefined` during SSR — the client re-reads on mount. */
export function readSignedInHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === "rm_signed_in=1" || c.startsWith("rm_signed_in=1"));
}
