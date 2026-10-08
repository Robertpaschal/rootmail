import { env } from "@rootmail/core";

/**
 * Is OUR platform mail limited to recipients who have confirmed their address
 * with the provider first? True while rootmail's own SES account is in the
 * sandbox — the same predicate packages/db/src/sending-access.ts uses for
 * customer sends. Anything we mail a stranger (an invite, a verification
 * link) is refused by the provider until they have clicked its confirmation.
 */
export function platformRecipientsRestricted(): boolean {
  return env.MAIL_PROVIDER === "ses" && env.SES_SANDBOX_MODE !== "false";
}
