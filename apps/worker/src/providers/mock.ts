import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { env, rootDir } from "@rootmail/core";
import { buildMimeMessage } from "./mime";
import type { MailProvider, OutboundEmail, SendResult } from "./types";

function maildir(): string {
  return isAbsolute(env.MAILDIR) ? env.MAILDIR : resolve(rootDir, env.MAILDIR);
}

/**
 * Local development provider — instead of talking to an ESP, it writes a fully
 * formed .eml file you can open in any mail client to preview the send (now
 * including any attachments, as a real multipart/mixed message).
 */
export class MockProvider implements MailProvider {
  readonly name = "mock";

  async send(email: OutboundEmail): Promise<SendResult> {
    const providerMessageId = `mock-${randomUUID()}`;
    const dir = maildir();
    await mkdir(dir, { recursive: true });
    const eml = buildMimeMessage(email, {
      messageId: `<${providerMessageId}@${env.ROOTMAIL_DOMAIN}>`,
      debugHeaders: true,
    });
    await writeFile(join(dir, `${email.messageId}.eml`), eml, "utf8");
    return { provider: this.name, providerMessageId };
  }
}
