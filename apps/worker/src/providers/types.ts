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
  /** Extra top-level headers, e.g. RFC 8058 one-click unsubscribe on bulk mail. */
  headers?: { name: string; value: string }[];
  /** File attachments (bytes already fetched), MIME-attached to the message. */
  attachments?: OutboundAttachment[];
}

export interface OutboundAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
}

export interface MailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}
