// Minimal, self-contained HTML for the public unsubscribe pages (contacts and
// admin announcements). No app shell — these render in the recipient's browser.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function unsubPage(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f7;margin:0;padding:48px 16px;color:#374151}.card{max-width:440px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}h1{font-size:18px;color:#111827;margin:0 0 12px}.btn{display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1>${bodyHtml}</div></body></html>`;
}
