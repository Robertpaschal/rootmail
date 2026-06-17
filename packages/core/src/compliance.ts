function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Append a CAN-SPAM compliance footer (the sender's physical postal address + an
 * unsubscribe link) to a rendered email.
 *
 * Call this for marketing/sales mail ONLY (transactional is exempt), and BEFORE
 * computing the content hash — so the Layer-3 proof bundle matches exactly what
 * the recipient receives. Transactional sends and replies skip it.
 */
export function appendComplianceFooter(
  content: { html: string; text: string },
  opts: { postalAddress?: string | null; unsubscribeUrl: string },
): { html: string; text: string } {
  const addr = opts.postalAddress?.trim();
  const addrHtml = addr ? `${escapeHtml(addr).replace(/\n/g, "<br/>")}<br/>` : "";
  const html =
    `${content.html}\n` +
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5">` +
    `${addrHtml}<a href="${opts.unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a>` +
    `</div>`;
  const text = `${content.text}\n\n--\n${addr ? `${addr}\n` : ""}Unsubscribe: ${opts.unsubscribeUrl}`;
  return { html, text };
}
