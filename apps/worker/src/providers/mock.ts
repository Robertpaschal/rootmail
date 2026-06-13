import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { env, rootDir } from "@rootmail/core";
import type { MailProvider, OutboundEmail, SendResult } from "./types";

function maildir(): string {
  return isAbsolute(env.MAILDIR) ? env.MAILDIR : resolve(rootDir, env.MAILDIR);
}

function formatAddress(email: string, name?: string | null): string {
  return name ? `${name} <${email}>` : email;
}

function buildEml(email: OutboundEmail, messageIdHeader: string): string {
  const boundary = `=_rootmail_${randomUUID()}`;
  const headers = [
    `From: ${formatAddress(email.from.email, email.from.name)}`,
    `To: ${email.to}`,
    email.replyTo ? `Reply-To: ${email.replyTo}` : null,
    `Subject: ${email.subject}`,
    `Message-ID: ${messageIdHeader}`,
    `Date: ${new Date().toUTCString()}`,
    email.dkim
      ? `X-Rootmail-DKIM: selector=${email.dkim.selector}; domain=${email.dkim.domain}; signed`
      : null,
    email.sandbox ? "X-Rootmail-Sandbox: true" : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter((h): h is string => h !== null);

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    email.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    email.html,
    "",
    `--${boundary}--`,
    "",
  ];

  return [...headers, "", ...body].join("\r\n");
}

/**
 * Local development provider — instead of talking to an ESP, it writes a fully
 * formed .eml file you can open in any mail client to preview the send.
 */
export class MockProvider implements MailProvider {
  readonly name = "mock";

  async send(email: OutboundEmail): Promise<SendResult> {
    const providerMessageId = `mock-${randomUUID()}`;
    const dir = maildir();
    await mkdir(dir, { recursive: true });
    const eml = buildEml(email, `<${providerMessageId}@${env.ROOTMAIL_DOMAIN}>`);
    await writeFile(join(dir, `${email.messageId}.eml`), eml, "utf8");
    return { provider: this.name, providerMessageId };
  }
}
