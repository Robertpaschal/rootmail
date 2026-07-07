/**
 * The small "Sent with rootmail" footer that rides along on email sent from a Free
 * wing — a non-obstructive upgrade nudge that appears on every message until the
 * sender upgrades to a paid tier (which removes it).
 *
 * Append it AFTER the compliance footer and BEFORE computing the content hash, so
 * the Layer-3 proof bundle matches exactly what the recipient receives — the same
 * discipline as appendComplianceFooter. Sandbox/test sends never get it (they never
 * leave), so gate the call on live mode at the call site.
 */
export function appendBrandingFooter(
  content: { html: string; text: string },
  opts: { url: string },
): { html: string; text: string } {
  const url = opts.url;
  const html =
    `${content.html}\n` +
    `<div style="margin-top:16px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.5">` +
    `Sent with <a href="${url}" style="color:#6b7280;text-decoration:none;font-weight:600">rootmail</a>` +
    `</div>`;
  const text = `${content.text}\n\nSent with rootmail — ${url}`;
  return { html, text };
}
