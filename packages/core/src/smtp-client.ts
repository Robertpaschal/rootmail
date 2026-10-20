import { connect, type Socket } from "node:net";
import nodemailer from "nodemailer";
import { resolveSmtpTarget, SMTP_TIMEOUTS, smtpErrorReason, smtpTransportOptions, SmtpGuardError, type SmtpTestHooks } from "./smtp-guard";

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

/**
 * Open the TCP connection ourselves (to the vetted IP — nodemailer never
 * resolves or connects on its own) so the whole exchange has an ABSOLUTE
 * deadline: nodemailer's timeouts are per-step and per-inactivity, and a server
 * that trickles bytes could otherwise hold a worker slot or API request forever.
 */
async function withTransport<T>(login: SmtpLogin, hooks: SmtpTestHooks, fn: (t: nodemailer.Transporter) => Promise<T>): Promise<T> {
  const deadlineMs = hooks.deadlineMs ?? SMTP_TIMEOUTS.total;
  const startedAt = Date.now();
  const target = await resolveSmtpTarget(login.host, login.port, hooks);
  const sockets: Socket[] = [];
  const transport = nodemailer.createTransport({
    ...smtpTransportOptions(target, { user: login.username, pass: login.password }, hooks.testCa),
    getSocket: (_opts: unknown, cb: (err: Error | null, socketOptions?: { connection: Socket }) => void) => {
      const socket = connect({ host: target.ip, port: target.port });
      sockets.push(socket);
      const onError = (e: Error) => cb(e);
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.off("error", onError);
        cb(null, { connection: socket });
      });
    },
  } as Parameters<typeof nodemailer.createTransport>[0]);
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      for (const s of sockets) s.destroy();
      reject(new SmtpGuardError(`the server took longer than ${Math.round(deadlineMs / 1000)}s to finish`));
    }, Math.max(0, deadlineMs - (Date.now() - startedAt)));
  });
  try {
    return await Promise.race([fn(transport), deadline]);
  } finally {
    clearTimeout(timer);
    transport.close();
    for (const s of sockets) s.destroy();
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
