import { randomUUID } from "node:crypto";
import type { SmtpTestHooks } from "@rootmail/core";
import { smtpClient, type SmtpLogin } from "@rootmail/core/smtp-client";
import { buildMimeMessage } from "./mime";
import type { MailProvider, OutboundEmail, SendResult } from "./types";

/** A BYO tenant's own SMTP server. Stored encrypted; only built inside for-org.ts. */
export type SmtpCredentials = SmtpLogin;

/**
 * A tenant's own SMTP server (bring-your-own-provider, flagged orgs only).
 *
 *  - The host is resolved and vetted on EVERY send (resolveSmtpTarget), and we
 *    connect to that vetted IP with SNI set to the hostname. A name re-pointed at
 *    an internal address after it was saved (DNS rebinding) is refused here.
 *  - TLS is mandatory: implicit on 465, STARTTLS required on 587/2525.
 *  - Their server signs DKIM; we send the message exactly as built, with the
 *    tenant's From as the envelope sender, so bounces (DSNs) go to THEIR mailbox.
 *  - One connection per message, closed afterwards. No pool to hold a stale IP.
 */
export class SmtpProvider implements MailProvider {
  readonly name = "smtp";

  constructor(
    private readonly creds: SmtpCredentials,
    /** Tests only. */
    private readonly testHooks: SmtpTestHooks = {},
  ) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    const supplied = email.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value;
    const domain = email.from.email.split("@")[1] ?? "localhost";
    const messageId = supplied ?? `<${randomUUID()}@${domain}>`;
    await smtpClient.sendSmtpRaw(this.creds, { from: email.from.email, to: email.to }, buildMimeMessage(email, { messageId }), this.testHooks);
    return { provider: this.name, providerMessageId: messageId };
  }
}
