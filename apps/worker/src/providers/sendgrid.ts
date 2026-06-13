import type { MailProvider, OutboundEmail, SendResult } from "./types";

/**
 * Placeholder for the SendGrid provider. The provider-router architecture
 * (primary → fallback → cost-optimized) plugs in here; for now local dev uses
 * the mock provider (MAIL_PROVIDER=mock).
 */
export class SendgridProvider implements MailProvider {
  readonly name = "sendgrid";

  async send(_email: OutboundEmail): Promise<SendResult> {
    throw new Error(
      "SendGrid provider is not implemented yet. Set MAIL_PROVIDER=mock for local development.",
    );
  }
}
