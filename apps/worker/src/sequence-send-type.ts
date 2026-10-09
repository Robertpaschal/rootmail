import type { MessageType } from "@rootmail/core";

/**
 * Which kind of mail a sequence step sends.
 *
 * Sequences are drips, so a step is marketing: it is metered against the
 * marketing allowance and carries the unsubscribe footer, postal address and
 * List-Unsubscribe headers. That stays the rule for every customer. Templates
 * default to "transactional", so honouring the template type for everyone
 * would quietly strip unsubscribe from customers' drips.
 *
 * The one exception is rootmail's own account sending a template it marked
 * transactional, which is the beta invite: a code the person asked for, sent
 * once on their request. Sending it as marketing gave it bulk-mail headers and
 * an unsubscribe footer, and Gmail filed it under Promotions.
 */
export function sequenceSendType(opts: { templateType: string | null | undefined; internalOrg: boolean }): MessageType {
  return opts.internalOrg && opts.templateType === "transactional" ? "transactional" : "marketing";
}
