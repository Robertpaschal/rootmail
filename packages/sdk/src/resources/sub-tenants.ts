import type { RootMail } from "../client";
import type { CreateSubTenantParams, EmailAuthReport, ListResponse, SubTenant, VerifyResult } from "../types";

export class SubTenants {
  constructor(private readonly client: RootMail) {}

  create(params: CreateSubTenantParams): Promise<SubTenant> {
    return this.client.request<SubTenant>({
      method: "POST",
      path: "/v1/sub-tenants",
      body: {
        name: params.name,
        external_id: params.externalId,
        sending_domain: params.sendingDomain,
        inherits_templates_from: params.inheritsTemplatesFrom,
      },
    });
  }

  get(id: string): Promise<SubTenant> {
    return this.client.request<SubTenant>({ method: "GET", path: `/v1/sub-tenants/${id}` });
  }

  list(): Promise<ListResponse<SubTenant>> {
    return this.client.request<ListResponse<SubTenant>>({ method: "GET", path: "/v1/sub-tenants" });
  }

  /** Check the domain's DNS records and flip the sub-tenant to `verified` when they pass. */
  verify(id: string): Promise<VerifyResult> {
    return this.client.request<VerifyResult>({ method: "POST", path: `/v1/sub-tenants/${id}/verify` });
  }

  /** Audit the sending domain's email authentication (SPF/DKIM/DMARC/BIMI). */
  auth(id: string): Promise<EmailAuthReport> {
    return this.client.request<EmailAuthReport>({ method: "GET", path: `/v1/sub-tenants/${id}/auth` });
  }
}
