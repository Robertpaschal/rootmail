import type { RootMail } from "../client";
import type { Analytics, Deliverability } from "../types";

type Window = { windowDays?: number; subTenantId?: string };

const query = (p: Window) => ({ window_days: p.windowDays, sub_tenant_id: p.subTenantId });

export class DeliverabilityResource {
  constructor(private readonly client: RootMail) {}

  /** Reputation score + bounce/complaint rates and recommendations. */
  get(params: Window = {}): Promise<Deliverability> {
    return this.client.request({ method: "GET", path: "/v1/deliverability", query: query(params) });
  }
}

export class AnalyticsResource {
  constructor(private readonly client: RootMail) {}

  /** Sent → delivered → opened → clicked funnel + rates, series, top templates. */
  get(params: Window = {}): Promise<Analytics> {
    return this.client.request({ method: "GET", path: "/v1/analytics", query: query(params) });
  }
}
