import type { RootMail } from "../client";
import type { SuppressionCheck } from "../types";

export class Suppressions {
  constructor(private readonly client: RootMail) {}

  /** Is this address on the suppression list (bounced/complained/unsubscribed)?
   * Worth checking before a one-off send to a risky address. */
  check(email: string): Promise<SuppressionCheck> {
    return this.client.request({ method: "GET", path: "/v1/suppressions/check", query: { email } });
  }
}
