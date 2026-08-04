/**
 * Where the customer dashboard lives. Server-side only — the value is not
 * NEXT_PUBLIC_, so it is undefined in the browser.
 *
 * One reader, because we already shipped the bug this prevents: the org page
 * read `process.env.DASHBOARD_URL` while compose supplies the value as
 * `ROOTMAIL_DASHBOARD_URL` (it maps `ROOTMAIL_DASHBOARD_URL: ${DASHBOARD_URL}`
 * — the bare name exists only in the HOST's .env.prod, never inside the
 * container). The `??` then quietly handed out `http://localhost:3001` links in
 * production. Nothing failed, nothing logged; the links simply went nowhere,
 * and it took someone clicking one to find out.
 *
 * That is the failure mode of an env var with a friendly default: a typo reads
 * as a working local dev setup. So the name is written ONCE, here.
 *
 * Read per call rather than at module scope — a module-level const is captured
 * when the module first loads, which makes it depend on whether the bundler
 * hoisted it above the point the runtime env was populated.
 */
export function dashboardUrl(): string {
  const url = process.env.ROOTMAIL_DASHBOARD_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  // Local dev only. In production this default is always wrong — say so
  // somewhere a person will see it, rather than emitting broken links.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[admin] ROOTMAIL_DASHBOARD_URL is not set — dashboard links will point at localhost.",
    );
  }
  return "http://localhost:3001";
}
