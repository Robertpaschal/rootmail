// The customer dashboard is a separate app/origin. Marketing only links to it.
// Override per environment with NEXT_PUBLIC_DASHBOARD_URL (e.g. http://localhost:3001
// in local dev); defaults to the intended production origin.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://app.rootmail.io";

export const signupUrl = `${DASHBOARD_URL}/signup`;
export const loginUrl = `${DASHBOARD_URL}/login`;
/** Where a signed-in visitor goes (root redirects to their overview). */
export const dashboardUrl = DASHBOARD_URL;

/** Non-authoritative navigation hint only; never use this for authorization. */
export function readSignedInHint(): boolean {
  return typeof document !== "undefined" && document.cookie.split(";").some((cookie) => cookie.trim() === "rm_signed_in=1");
}
