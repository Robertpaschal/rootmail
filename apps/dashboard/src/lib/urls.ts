/**
 * The dashboard's own PUBLIC origin, and absolute URLs on it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Behind a reverse proxy, Next resolves `req.url` to the CONTAINER's origin —
 * `http://localhost:3000` — not the address the browser used. So the natural
 * spelling of a redirect in a route handler:
 *
 *     NextResponse.redirect(new URL("/inbox", req.url))     // ← WRONG in prod
 *
 * emits `Location: https://localhost:3000/inbox` and dumps the user on a host
 * that does not exist. It works perfectly in local dev, where the container
 * origin IS the browser's, which is exactly why it survives review and ships.
 *
 * This was already learned once and fixed for OAuth — then the staff handoff
 * (`/impersonate`) was written later and reached for `req.url` again, because
 * the helper lived in `oauth.ts` where nobody looks for a URL builder. Hence
 * this module: the fix belongs somewhere the next redirect will find it.
 *
 * Any route handler that redirects MUST use `appUrl()`.
 */

/** The dashboard's public base URL, no trailing slash. */
export function dashboardBaseUrl(): string {
  const url = process.env.DASHBOARD_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    console.warn("[dashboard] DASHBOARD_URL is not set — redirects will point at localhost.");
  }
  return "http://localhost:3001";
}

/** An absolute URL on the dashboard's own public origin. */
export function appUrl(path: string): string {
  return new URL(path, dashboardBaseUrl()).toString();
}
