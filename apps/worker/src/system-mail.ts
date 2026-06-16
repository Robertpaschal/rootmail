import { env, type SystemMailJob } from "@rootmail/core";
import { getProviderFor } from "./providers";

/**
 * Deliver a platform/transactional email (verification, password reset) straight
 * through the configured provider — no DB message, no thread, no quota. Always
 * uses the real provider (getProviderFor(false)); these are never test-mode.
 */
export async function processSystemMail(job: SystemMailJob): Promise<void> {
  const from = job.from ?? `no-reply@${env.ROOTMAIL_DOMAIN}`;
  await getProviderFor(false).send({
    messageId: `sys-${Date.now()}`,
    from: { email: from, name: "rootmail" },
    to: job.to,
    replyTo: null,
    subject: job.subject,
    html: job.html,
    text: job.text,
    dkim: null,
    sandbox: false,
  });
}
