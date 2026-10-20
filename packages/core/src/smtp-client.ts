import nodemailer from "nodemailer";
import { resolveSmtpTarget, smtpErrorReason, smtpTransportOptions, type SmtpTestHooks } from "./smtp-guard";

/**
 * The only two things Rootmail does with a tenant's SMTP server. Kept out of the
 * core index (import "@rootmail/core/smtp-client") so the dashboard bundle never
 * pulls in nodemailer. Every call re-runs the SSRF guard: there is no cached
 * target, so DNS rebinding after save gains nothing.
 */

export interface SmtpLogin {
  host: string;
  port: number;
  username: string;
  password: string;
}

async function withTransport<T>(login: SmtpLogin, hooks: SmtpTestHooks, fn: (t: nodemailer.Transporter) => Promise<T>): Promise<T> {
  const target = await resolveSmtpTarget(login.host, login.port, hooks);
  const transport = nodemailer.createTransport(
    smtpTransportOptions(target, { user: login.username, pass: login.password }, hooks.testCa),
  );
  try {
    return await fn(transport);
  } finally {
    transport.close();
  }
}

/** Connect, TLS, AUTH, QUIT. Sends nothing. */
export async function verifySmtpLogin(
  login: SmtpLogin,
  hooks: SmtpTestHooks = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await withTransport(login, hooks, (t) => t.verify());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: smtpErrorReason(e) };
  }
}

/** Send one already-built RFC 5322 message. Throws an Error whose message is safe to show. */
export async function sendSmtpRaw(
  login: SmtpLogin,
  envelope: { from: string; to: string },
  raw: string,
  hooks: SmtpTestHooks = {},
): Promise<void> {
  try {
    await withTransport(login, hooks, (t) => t.sendMail({ envelope: { from: envelope.from, to: [envelope.to] }, raw }));
  } catch (e) {
    throw new Error(smtpErrorReason(e));
  }
}

/**
 * The same two functions as one object, which is what callers use, so DB-backed
 * route and pipeline tests can stub the network with mock.method (ESM named
 * exports can't be replaced).
 */
export const smtpClient = { verifySmtpLogin, sendSmtpRaw };
