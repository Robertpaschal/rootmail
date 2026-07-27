import type { RootMail } from "../client";
import type { TestRecipient, TestRecipientsReset } from "../types";

/**
 * Test recipients — the real send path, to a destination that can't be harmed.
 *
 * The sandbox proves your integration; it can't prove delivery, because it never
 * reaches a provider. These addresses do: mail to them is signed with your DKIM
 * key, handed to your provider, and reported back through your webhooks — but it
 * lands on the provider's mailbox simulator, so no person receives it and your
 * sending reputation is untouched, even when you deliberately force a bounce.
 *
 * ```ts
 * const { data } = await rootmail.testing.list();
 * const bounce = data.find((t) => t.slug === "bounced")!;
 * await rootmail.messages.send({ to: bounce.email, subject: "Bounce me", html: "<p>hi</p>" });
 * ```
 */
export class Testing {
  constructor(private readonly client: RootMail) {}

  /** Every scenario you can prove, and the address that proves it. */
  list(): Promise<{ object: "list"; domain: string; data: TestRecipient[] }> {
    return this.client.request({ method: "GET", path: "/v1/test-recipients" });
  }

  /**
   * Clear suppressions for the test domain, so bounce and complaint scenarios
   * can be run again. Real recipients are never touched.
   */
  reset(): Promise<TestRecipientsReset> {
    return this.client.request({ method: "POST", path: "/v1/test-recipients/reset" });
  }
}
