import { env } from "./env";
import type { SystemMailJob } from "./queue";

// Lifecycle email bodies (moved verbatim from apps/worker/src/lifecycle.ts) so the
// worker's daily sweep and the staff-only preview send build byte-identical mail.
// Bodies are inline + email-client-safe, matching the platform email style.

export function lifecycleDashboardUrl(): string {
  return (env.DASHBOARD_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
export function lifecycleEsc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
export function lifecycleWrap(inner: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:480px">${inner}</div>`;
}
export function lifecycleButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${label}</a>`;
}

/**
 * The win-back email. Marketing, and genuinely so: this one is a pitch, fully
 * gated and unsubscribable like a customer's own marketing. It ends "Just reply
 * to this email"; with no explicit Reply-To the reply goes to the capture
 * address and lands in the Replies inbox (pre-#26 behaviour).
 */
export function winBackJob(owner: { email: string; name: string | null }): SystemMailJob {
  const mail = winBackEmail(owner.name);
  return {
    to: owner.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    cls: "marketing",
  };
}

export function winBackEmail(name: string | null) {
  const hi = name ? `Hi ${lifecycleEsc(name)},` : "Hi,";
  const d = lifecycleDashboardUrl();
  return {
    subject: "We miss you at rootmail",
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nIt's been a while since you sent with rootmail — your account is ready ` +
      `when you are. Jump back in:\n${d}\n\nNeed a hand getting going again? Just reply to this email.`,
    html: lifecycleWrap(
      `<p>${hi}</p><p>It's been a while since you sent with rootmail — your account's ready when you are.</p>` +
        `<p>${lifecycleButton(d, "Open your dashboard")}</p>` +
        `<p style="color:#666;font-size:13px">Need a hand getting going again? Just reply to this email.</p>`,
    ),
  };
}
