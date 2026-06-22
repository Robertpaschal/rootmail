import type { RootMail } from "../client";
import type { ComplianceExport, RetentionPolicy } from "../types";

export class Exports {
  constructor(private readonly client: RootMail) {}

  /** A signed, tamper-evident bundle of every message + audit trail in a window.
   * Verify it with POST /v1/proof/verify ({ bundle, signature }). Enterprise. */
  compliance(params: { from: string | Date; to?: string | Date; subTenantId?: string }): Promise<ComplianceExport> {
    const iso = (d: string | Date | undefined) => (d instanceof Date ? d.toISOString() : d);
    return this.client.request({
      method: "GET",
      path: "/v1/exports/compliance",
      query: { from: iso(params.from), to: iso(params.to), sub_tenant_id: params.subTenantId },
    });
  }
}

export class Retention {
  constructor(private readonly client: RootMail) {}

  get(): Promise<RetentionPolicy> {
    return this.client.request({ method: "GET", path: "/v1/retention" });
  }

  /** Set (or clear, with retentionDays = null) the workspace retention policy. */
  update(params: { retentionDays: number | null; retentionMode?: "redact" | "delete" }): Promise<RetentionPolicy> {
    return this.client.request({
      method: "PUT",
      path: "/v1/retention",
      body: { retention_days: params.retentionDays, retention_mode: params.retentionMode },
    });
  }
}
