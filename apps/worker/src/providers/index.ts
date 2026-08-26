import { env, testRecipientFor } from "@rootmail/core";
import { MailgunProvider } from "./mailgun";
import { MockProvider } from "./mock";
import { SendgridProvider } from "./sendgrid";
import { SesProvider } from "./ses";
import type { MailProvider } from "./types";

let provider: MailProvider | undefined;
let mock: MockProvider | undefined;

export function getProvider(): MailProvider {
  if (provider) return provider;
  if (env.MAIL_PROVIDER === "ses") provider = new SesProvider();
  else if (env.MAIL_PROVIDER === "mailgun") provider = new MailgunProvider();
  else if (env.MAIL_PROVIDER === "sendgrid") provider = new SendgridProvider();
  else provider = new MockProvider();
  return provider;
}

/**
 * Provider for a specific send.
 *
 * Test-mode ("sandbox") sends go through the mock provider so made-up recipients
 * never reach a real ESP — that keeps test bounces off the production sending
 * domain's reputation.
 *
 * The one exception is a **reserved test recipient**: those resolve to the
 * provider's mailbox simulator, which reaches no person and is excluded from
 * reputation. Sending them for real is safe, and it's the only way the sandbox
 * can prove anything about actual delivery — so they always take the live path.
 */
export function getProviderFor(sandbox: boolean, toEmail?: string): MailProvider {
  if (!sandbox) return getProvider();
  if (toEmail && testRecipientFor(toEmail)) return getProvider();
  if (env.MAIL_PROVIDER === "mock") return getProvider();
  return (mock ??= new MockProvider());
}

export type { MailProvider, OutboundEmail, SendResult } from "./types";
