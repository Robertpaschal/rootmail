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
