import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { env } from "@rootmail/core";
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
 * Region + credentials resolve through the SDK's default chain (AWS_REGION,
 * AWS_ACCESS_KEY_ID/SECRET, or an instance role in prod).
 */
export class SesProvider implements MailProvider {
  readonly name = "ses";
  private readonly client = new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});

  async send(email: OutboundEmail): Promise<SendResult> {
    const res = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: formatAddress(email.from.email, email.from.name),
        Destination: { ToAddresses: [email.to] },
        ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
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
      }),
    );
    return { provider: this.name, providerMessageId: res.MessageId ?? "" };
  }
}
