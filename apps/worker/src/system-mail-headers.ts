import { mayUnsubscribe, type SystemMailClass, unsubscribeUrl } from "@rootmail/core";

/**
 * RFC 8058 one-click unsubscribe headers for our own mail, or none.
 *
 * Only the class that may be unsubscribed from ("marketing": win-back,
 * announcements) gets them. Security and transactional mail (verification,
 * password resets, invites, the beta invite, receipts, support replies) must
 * arrive and stays header-free, exactly as #25 left it, so Gmail keeps it out of
 * Promotions. The URL is the same signed /v1/unsubscribe link customers' mail
 * uses, scoped to our internal workspace: a one-click POST writes an
 * `unsubscribe` suppression there, which SUPPRESSION_BLOCKS already applies to
 * marketing (and only marketing) system mail.
 */
export function systemMailUnsubHeaders(
  cls: SystemMailClass,
  workspaceId: string,
  to: string,
): { name: string; value: string }[] {
  if (!mayUnsubscribe(cls)) return [];
  return [
    { name: "List-Unsubscribe", value: `<${unsubscribeUrl({ w: workspaceId, e: to })}>` },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ];
}
