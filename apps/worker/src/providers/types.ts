export interface OutboundEmail {
  messageId: string;
  from: { email: string; name?: string | null };
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  dkim?: { domain: string; selector: string; privateKeyPem: string } | null;
  sandbox?: boolean;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
}

export interface MailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}
