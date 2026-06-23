import type { RootMail } from "../client";
import type { Billing as BillingResponse } from "../types";

export class Billing {
  constructor(private readonly client: RootMail) {}

  /** The org's plan, included quota/AI credits, features, and usage this period —
   * handy for guarding against limits in your own code. */
  get(): Promise<BillingResponse> {
    return this.client.request({ method: "GET", path: "/v1/billing" });
  }
}
