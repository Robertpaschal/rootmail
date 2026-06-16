import { env } from "@rootmail/core";
import { MockProvider } from "./mock";
import { SendgridProvider } from "./sendgrid";
import { SesProvider } from "./ses";
import type { MailProvider } from "./types";

let provider: MailProvider | undefined;
let mock: MockProvider | undefined;

export function getProvider(): MailProvider {
  if (provider) return provider;
  if (env.MAIL_PROVIDER === "ses") provider = new SesProvider();
  else if (env.MAIL_PROVIDER === "sendgrid") provider = new SendgridProvider();
  else provider = new MockProvider();
  return provider;
}

/**
 * Provider for a specific send. Test-mode ("sandbox") sends always go through the
 * mock provider so synthetic/test recipients never reach a real ESP — this keeps
 * test bounces off the production sending domain's reputation.
 */
export function getProviderFor(sandbox: boolean): MailProvider {
  if (!sandbox) return getProvider();
  if (env.MAIL_PROVIDER === "mock") return getProvider();
  return (mock ??= new MockProvider());
}

export type { MailProvider, OutboundEmail, SendResult } from "./types";
