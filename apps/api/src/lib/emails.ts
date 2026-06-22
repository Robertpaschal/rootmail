import { env } from "@rootmail/core";

// Platform/transactional email bodies (verification, password reset). Plain,
// email-client-safe HTML with a text fallback.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function dashboardOrigin(): string {
  return (env.DASHBOARD_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${label}</a>`;
}

function wrap(inner: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:480px">${inner}</div>`;
}

/** Escape user-controlled text before interpolating into email HTML. */
function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function domain(): string {
  return env.ROOTMAIL_DOMAIN;
}

export function verificationEmail(token: string, name?: string | null): EmailContent {
  const link = `${dashboardOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "Verify your email",
    text: `${hi}\n\nConfirm your email to finish setting up your rootmail account:\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, you can ignore this email.`,
    html: wrap(
      `<p>${hi}</p><p>Confirm your email to finish setting up your rootmail account.</p>` +
        `<p>${button(link, "Verify email")}</p>` +
        `<p style="color:#666;font-size:13px">Or paste this link:<br>${link}</p>` +
        `<p style="color:#666;font-size:13px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
    ),
  };
}

export function welcomeEmail(name?: string | null): EmailContent {
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const dash = dashboardOrigin();
  return {
    subject: "Welcome to rootmail 👋",
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nYour email is verified and your rootmail account is ready.\n\n` +
      `Open your dashboard, grab an API key, and send your first email:\n${dash}\n\n` +
      `Docs: https://${domain()}/docs\n\n— The rootmail team`,
    html: wrap(
      `<p>${hi}</p><p>Your email is verified and your rootmail account is ready.</p>` +
        `<p>${button(dash, "Open your dashboard")}</p>` +
        `<p style="color:#666;font-size:13px">Grab an API key and send your first email, or explore the ` +
        `<a href="https://${domain()}/docs">docs</a>.</p>`,
    ),
  };
}

export interface InvitationEmailOpts {
  orgName: string;
  inviterName?: string | null;
  acceptUrl: string;
  role: string;
}

export function invitationEmail(opts: InvitationEmailOpts): EmailContent {
  const whoText = opts.inviterName ? `${opts.inviterName} invited you` : "You've been invited";
  const whoHtml = opts.inviterName ? `${esc(opts.inviterName)} invited you` : "You've been invited";
  return {
    subject: `You're invited to join ${opts.orgName} on rootmail`,
    text:
      `${whoText} to join ${opts.orgName} on rootmail as ${opts.role}.\n\n` +
      `Accept your invitation:\n${opts.acceptUrl}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
    html: wrap(
      `<p>${whoHtml} to join <strong>${esc(opts.orgName)}</strong> on rootmail as ${esc(opts.role)}.</p>` +
        `<p>${button(opts.acceptUrl, "Accept invitation")}</p>` +
        `<p style="color:#666;font-size:13px">Or paste this link:<br>${opts.acceptUrl}</p>` +
        `<p style="color:#666;font-size:13px">If you weren't expecting this, you can ignore this email.</p>`,
    ),
  };
}

export function paymentFailedEmail(name?: string | null): EmailContent {
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const billing = `${dashboardOrigin()}/billing`;
  return {
    subject: "Your rootmail payment didn't go through",
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nWe couldn't process your latest rootmail payment. ` +
      `Please update your payment method to keep your plan active:\n${billing}\n\n` +
      `We'll retry automatically — if the card keeps failing, your plan may be paused.`,
    html: wrap(
      `<p>${hi}</p><p>We couldn't process your latest rootmail payment.</p>` +
        `<p>${button(billing, "Update payment method")}</p>` +
        `<p style="color:#666;font-size:13px">We'll retry automatically — if it keeps failing, your plan may be paused.</p>`,
    ),
  };
}

export function trialEndingEmail(name?: string | null, endsAt?: Date | null): EmailContent {
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const billing = `${dashboardOrigin()}/billing`;
  const when = endsAt
    ? ` on ${endsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
    : " soon";
  return {
    subject: "Your rootmail trial is ending soon",
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nYour rootmail free trial ends${when}. ` +
      `Add a payment method to keep your plan without interruption:\n${billing}`,
    html: wrap(
      `<p>${hi}</p><p>Your rootmail free trial ends${when}.</p>` +
        `<p>${button(billing, "Manage billing")}</p>` +
        `<p style="color:#666;font-size:13px">Add a payment method to keep your plan without interruption.</p>`,
    ),
  };
}

/** A staff-authored announcement to a customer. The body is plain text (escaped +
 * paragraph-wrapped); a footer explains why they received it. */
export function announcementEmail(opts: {
  subject: string;
  body: string;
  recipientName?: string | null;
  unsubscribeUrl?: string;
}): EmailContent {
  const hi = opts.recipientName ? `Hi ${esc(opts.recipientName)},` : "Hi,";
  const hiText = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const bodyHtml = esc(opts.body)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const unsubText = opts.unsubscribeUrl ? `\n\nUnsubscribe from announcements: ${opts.unsubscribeUrl}` : "";
  const unsubHtml = opts.unsubscribeUrl
    ? `<p style="color:#999;font-size:12px">Don't want these? <a href="${opts.unsubscribeUrl}" style="color:#999">Unsubscribe from announcements</a>.</p>`
    : "";
  return {
    subject: opts.subject,
    text: `${hiText}\n\n${opts.body}\n\n— The rootmail team\n\nYou're receiving this because you own a rootmail account.${unsubText}`,
    html: wrap(
      `<p>${hi}</p>${bodyHtml}` +
        `<p style="color:#666;font-size:13px;margin-top:20px">— The rootmail team</p>` +
        `<p style="color:#999;font-size:12px">You're receiving this because you own a rootmail account.</p>` +
        unsubHtml,
    ),
  };
}

export function passwordResetEmail(token: string, name?: string | null): EmailContent {
  const link = `${dashboardOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  const hi = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "Reset your password",
    text: `${hi}\n\nReset your rootmail password:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.`,
    html: wrap(
      `<p>${hi}</p><p>We received a request to reset your rootmail password.</p>` +
        `<p>${button(link, "Reset password")}</p>` +
        `<p style="color:#666;font-size:13px">Or paste this link:<br>${link}</p>` +
        `<p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.</p>`,
    ),
  };
}
