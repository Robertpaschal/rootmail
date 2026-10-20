import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { env, resolveDeliveryAddress, sesSafeHeaders } from "@rootmail/core";
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
/** A customer's own SES credentials, when they have connected their account. */
export interface SesCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  /**
   * BYO assume-role: short-lived credentials for the tenant's role, refreshed
   * before expiry (see for-org.ts). Takes precedence over the static keys.
   */
  credentialProvider?: () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: Date }>;
  region?: string;
  /** The tenant's OWN configuration set in their account, if they have one. */
  configurationSet?: string | null;
}

/**
 * Which configuration set a send names.
 *
 * Our account: the per-message set (dedicated IP / platform), else our shared
 * SES_CONFIGURATION_SET. A tenant's account: ONLY the tenant's own set, or none.
 * Our set names mean nothing in their account — SES rejects a send naming a set
 * that does not exist there, and if one happened to share the name it would
 * publish their events to wherever THEY pointed it.
 */
export function sesConfigurationSetFor(
  email: { configurationSet?: string | null },
  customer: SesCredentials | undefined,
): string | undefined {
  if (customer) return customer.configurationSet || undefined;
  return email.configurationSet || env.SES_CONFIGURATION_SET || undefined;
}

export class SesProvider implements MailProvider {
  readonly name = "ses";
  private readonly client: SESv2Client;
  private readonly customer: SesCredentials | undefined;

  /**
   * With no argument this is OUR account, resolving through the SDK's default
   * chain. With credentials it is the CUSTOMER'S account — their IPs, their
   * reputation, their provider approval — which is the whole point: a platform
   * that already sends email does not need us to be its MTA, and our own
   * approval should not gate their launch.
   */
  constructor(creds?: SesCredentials) {
    this.customer = creds;
    this.client = creds
      ? new SESv2Client({
          region: creds.region ?? env.AWS_REGION ?? "us-east-1",
          credentials: creds.credentialProvider ?? { accessKeyId: creds.accessKeyId!, secretAccessKey: creds.secretAccessKey! },
        })
      : new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const hasAttachments = (email.attachments?.length ?? 0) > 0;
    // A configuration set is what makes SES publish DELIVERY / OPEN / CLICK events
    // (bounce/complaint can come off the identity, but delivered/opened do not).
    // Without it, a message that truly landed never advances past "sent".
    // An org with an active dedicated IP overrides the shared set with its own,
    // which routes through its dedicated IP pool (that set must carry the same
    // SNS event destinations, enforced at staff-activation time).
    const ConfigurationSetName = sesConfigurationSetFor(email, this.customer);

    // A rootmail test alias (bounced@test.rootmail.dev …) is swapped for its SES
    // mailbox-simulator address HERE, at the last hop — so the send is genuinely
    // real (same API call, same Easy-DKIM signing, same event webhooks) while the
    // message record everywhere else keeps the friendly address the user typed.
    // Simulator traffic is excluded from SES reputation, so forcing a bounce on
    // purpose is safe. Non-test addresses pass through untouched.
    const destination = resolveDeliveryAddress(email.to);

    // The Raw path builds the MIME itself, so it carries every header untouched.
    // The Simple path hands them to SES, which validates them.
    const sesHeaders = sesSafeHeaders(email.headers).map((h) => ({ Name: h.name, Value: h.value }));

    const command = hasAttachments
      ? new SendEmailCommand({
          FromEmailAddress: formatAddress(email.from.email, email.from.name),
          Destination: { ToAddresses: [destination] },
          ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
          ConfigurationSetName,
          Content: { Raw: { Data: Buffer.from(buildMimeMessage({ ...email, to: destination }), "utf8") } },
        })
      : new SendEmailCommand({
          FromEmailAddress: formatAddress(email.from.email, email.from.name),
          Destination: { ToAddresses: [destination] },
          ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
          ConfigurationSetName,
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: email.html, Charset: "UTF-8" },
                Text: { Data: email.text, Charset: "UTF-8" },
              },
              // e.g. List-Unsubscribe / List-Unsubscribe-Post on marketing sends,
              // and In-Reply-To / References on a reply. Filtered, because one
              // header SES reserves rejects the whole message.
              Headers: sesHeaders.length ? sesHeaders : undefined,
            },
          },
        });

    const res = await this.client.send(command);
    return { provider: this.name, providerMessageId: res.MessageId ?? "" };
  }
}
