import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { env } from "@rootmail/core";
import { buildMimeMessage } from "./mime";
import type { MailProvider, OutboundEmail, SendResult } from "./types";

function formatAddress(email: string, name?: string | null): string {
  return name ? `${name} <${email}>` : email;
}

/**
 * Amazon SES (v2) provider. Sends via the Simple content API; SES Easy DKIM
 * signs outbound mail for the verified sending domain automatically, so we don't
 * pass our own DKIM material here. Async delivery/bounce/complaint events arrive
 * separately via SNS (wired in Phase 1.5), not from this call.
 *
 * When a message carries attachments, SES's Simple content can't express them,
 * so we build the full MIME ourselves and send it as Raw content (Easy DKIM
 * still signs it). Everything else stays on the Simple path.
 *
 * Region + credentials resolve through the SDK's default chain (AWS_REGION,
 * AWS_ACCESS_KEY_ID/SECRET, or an instance role in prod).
 */
export class SesProvider implements MailProvider {
  readonly name = "ses";
  private readonly client = new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});

  async send(email: OutboundEmail): Promise<SendResult> {
    const hasAttachments = (email.attachments?.length ?? 0) > 0;
    // A configuration set is what makes SES publish DELIVERY / OPEN / CLICK events
    // (bounce/complaint can come off the identity, but delivered/opened do not).
    // Without it, a message that truly landed never advances past "sent".
    const ConfigurationSetName = env.SES_CONFIGURATION_SET || undefined;

    const command = hasAttachments
      ? new SendEmailCommand({
          FromEmailAddress: formatAddress(email.from.email, email.from.name),
          Destination: { ToAddresses: [email.to] },
          ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
          ConfigurationSetName,
          Content: { Raw: { Data: Buffer.from(buildMimeMessage(email), "utf8") } },
        })
      : new SendEmailCommand({
          FromEmailAddress: formatAddress(email.from.email, email.from.name),
          Destination: { ToAddresses: [email.to] },
          ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
          ConfigurationSetName,
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: email.html, Charset: "UTF-8" },
                Text: { Data: email.text, Charset: "UTF-8" },
              },
              // e.g. List-Unsubscribe / List-Unsubscribe-Post on marketing sends.
              Headers: email.headers?.length
                ? email.headers.map((h) => ({ Name: h.name, Value: h.value }))
                : undefined,
            },
          },
        });

    const res = await this.client.send(command);
    return { provider: this.name, providerMessageId: res.MessageId ?? "" };
  }
}
