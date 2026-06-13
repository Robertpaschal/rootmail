import { env } from "@rootmail/core";
import { MockProvider } from "./mock";
import { SendgridProvider } from "./sendgrid";
import type { MailProvider } from "./types";

let provider: MailProvider | undefined;

export function getProvider(): MailProvider {
  if (provider) return provider;
  provider = env.MAIL_PROVIDER === "sendgrid" ? new SendgridProvider() : new MockProvider();
  return provider;
}

export type { MailProvider, OutboundEmail, SendResult } from "./types";
