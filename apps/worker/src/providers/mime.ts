import { randomUUID } from "node:crypto";
import type { OutboundEmail } from "./types";

// A small, correct RFC 5322 / MIME builder shared by the providers that ship a
// full message themselves: the mock provider (writes a .eml) and SES's raw path
// (used only when there are attachments). Everything is base64-encoded so any
// UTF-8 body, subject, or binary attachment survives transport intact.

function b64(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  // 76-char lines per RFC 2045.
  return buf.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

/** Encode a header value as an RFC 2047 encoded-word when it isn't plain ASCII. */
function encodeHeaderWord(s: string): string {
  return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function formatAddress(email: string, name?: string | null): string {
  return name ? `${encodeHeaderWord(name)} <${email}>` : email;
}

/** Strip anything that could break out of a quoted filename header. */
function safeFilename(name: string): string {
  return (name || "attachment").replace(/["\r\n\\]/g, "").slice(0, 200) || "attachment";
}

/** The two-part text/html body of a multipart/alternative, boundary included. */
function alternativeBody(email: OutboundEmail, boundary: string): string {
  return [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(email.text ?? ""),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(email.html ?? ""),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export interface MimeOptions {
  /** Angle-bracketed Message-ID, e.g. `<abc@domain>`. */
  messageId?: string;
  /** Include the mock provider's debug markers (DKIM/sandbox). */
  debugHeaders?: boolean;
}

/** Build a complete RFC 822 message (headers + MIME body) for `email`. */
export function buildMimeMessage(email: OutboundEmail, opts: MimeOptions = {}): string {
  const alt = `alt_${randomUUID()}`;
  const attachments = email.attachments ?? [];

  const headers: (string | null)[] = [
    `From: ${formatAddress(email.from.email, email.from.name)}`,
    `To: ${email.to}`,
    email.replyTo ? `Reply-To: ${email.replyTo}` : null,
    `Subject: ${encodeHeaderWord(email.subject)}`,
    opts.messageId ? `Message-ID: ${opts.messageId}` : null,
    `Date: ${new Date().toUTCString()}`,
    opts.debugHeaders && email.dkim
      ? `X-Rootmail-DKIM: selector=${email.dkim.selector}; domain=${email.dkim.domain}; signed`
      : null,
    opts.debugHeaders && email.sandbox ? "X-Rootmail-Sandbox: true" : null,
    ...(email.headers ?? []).map((h) => `${h.name}: ${h.value}`),
    "MIME-Version: 1.0",
  ];

  // No attachments → a plain multipart/alternative message.
  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${alt}"`);
    return headers.filter((h): h is string => h !== null).join("\r\n") + "\r\n\r\n" + alternativeBody(email, alt);
  }

  // With attachments → multipart/mixed wrapping the alternative + each file.
  const mixed = `mixed_${randomUUID()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);

  const body: string[] = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    alternativeBody(email, alt),
    "",
  ];
  for (const a of attachments) {
    const filename = safeFilename(a.filename);
    body.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      b64(a.content),
      "",
    );
  }
  body.push(`--${mixed}--`, "");

  return headers.filter((h): h is string => h !== null).join("\r\n") + "\r\n\r\n" + body.join("\r\n");
}
