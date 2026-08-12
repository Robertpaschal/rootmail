// The starter template every rootmail workspace begins with.
//
// It lives here, in packages/db, rather than beside the signup flow because
// TWO paths create workspaces: provisionAccount() for customers, and
// ensureInternalOrg() for rootmail's own. Only the first seeded it, so
// rootmail's own studio opened empty while every customer's opened with
// something to edit — a small break in "we use exactly what users use",
// and the kind that only shows up when you actually look at your own account.

// A branded starter template seeded into every new account so the workspace
// isn't empty on first login — it opens in the writing editor (blocks) and
// already demonstrates the footer + signed {{unsubscribe_url}}.
export const STARTER_TEMPLATE = {
  name: "Welcome",
  slug: "welcome",
  type: "transactional" as const,
  subject: "Welcome to {{product}}, {{name}}!",
  html:
    `<!doctype html><html><body style="margin:0;background:#f4f4f7;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;"><tr><td align="center" style="padding:24px;">` +
    `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><tr><td style="padding:32px;">` +
    `<h1 style="margin:0 0 12px;font-size:24px;color:#111827;">Welcome, {{name}} 👋</h1>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Thanks for joining {{product}} — we're glad you're here.</p>` +
    `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:6px;background:#4f46e5;"><a href="{{action_url}}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">Get started</a></td></tr></table>` +
    `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">You're receiving this because you signed up for {{product}}. <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>.</p>` +
    `</td></tr></table></td></tr></table></body></html>`,
  text:
    "Welcome, {{name}}!\n\nThanks for joining {{product}} — we're glad you're here.\nGet started: {{action_url}}\n\nUnsubscribe: {{unsubscribe_url}}",
  blocks: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome, {{name}} 👋" }] },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thanks for joining {{product}} — we're glad you're here." }],
      },
      { type: "button", attrs: { label: "Get started", href: "{{action_url}}", bg: "#4f46e5" } },
      {
        type: "footer",
        attrs: { text: "You're receiving this because you signed up for {{product}}.", showUnsubscribe: true },
      },
    ],
  } as Record<string, unknown>,
  variablesSchema: { name: "string", product: "string", action_url: "string (url)" } as Record<string, unknown>,
};
