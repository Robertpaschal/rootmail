// The customer dashboard is a separate app/origin. Marketing only links to it.
// Override per environment with NEXT_PUBLIC_DASHBOARD_URL (e.g. http://localhost:3001
// in local dev); defaults to the intended production origin.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.rootmail.io";

export const signupUrl = `${DASHBOARD_URL}/signup`;
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
