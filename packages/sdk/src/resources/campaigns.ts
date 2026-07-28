import type { RootMail } from "../client";
import type { Campaign, CampaignAnalytics, CampaignPreviewRecipient, ListResponse } from "../types";

export class Campaigns {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<Campaign>> {
    return this.client.request({ method: "GET", path: "/v1/campaigns" });
  }

  get(id: string): Promise<Campaign> {
    return this.client.request({ method: "GET", path: `/v1/campaigns/${id}` });
  }

  /** The campaign's own sent → delivered → opened → clicked funnel and rates. */
  analytics(id: string): Promise<CampaignAnalytics> {
    return this.client.request({ method: "GET", path: `/v1/campaigns/${id}/analytics` });
  }

  update(
    id: string,
    params: { name?: string; listId?: string; templateId?: string; subject?: string },
  ): Promise<Campaign> {
    return this.client.request({
      method: "PATCH",
      path: `/v1/campaigns/${id}`,
      body: {
        name: params.name,
        list_id: params.listId,
        template_id: params.templateId,
        subject: params.subject,
      },
    });
  }

  create(params: { name: string; listId?: string; templateId?: string; subject?: string }): Promise<Campaign> {
    return this.client.request({
      method: "POST",
      path: "/v1/campaigns",
      body: {
        name: params.name,
        list_id: params.listId,
        template_id: params.templateId,
        subject: params.subject,
      },
    });
  }

  send(id: string, params: { scheduledAt?: string | Date } = {}): Promise<Campaign> {
    const scheduledAt = params.scheduledAt instanceof Date ? params.scheduledAt.toISOString() : params.scheduledAt;
    return this.client.request({
      method: "POST",
      path: `/v1/campaigns/${id}/send`,
      body: { scheduled_at: scheduledAt },
    });
  }

  /**
   * Pre-flight: each recipient's actual copy, resolved by the same rules the
   * send uses — their contact fields and the A/B variant their tags select.
   * Read-only; it sends nothing.
   */
  preview(
    id: string,
    params: { limit?: number } = {},
  ): Promise<{ total: number; data: CampaignPreviewRecipient[] }> {
    return this.client.request({
      method: "GET",
      path: `/v1/campaigns/${id}/preview`,
      query: { limit: params.limit },
    });
  }

  /**
   * Change one recipient's copy. Their version wins over the template AND over
   * any A/B variant. Draft/scheduled campaigns only.
   */
  setRecipientCopy(
    id: string,
    params: { email: string; subject?: string; html?: string },
  ): Promise<{ object: "campaign_override" }> {
    return this.client.request({ method: "PUT", path: `/v1/campaigns/${id}/overrides`, body: params });
  }

  /** Put a recipient back on the campaign's normal copy. */
  clearRecipientCopy(id: string, email: string): Promise<{ deleted: boolean }> {
    return this.client.request({
      method: "DELETE",
      path: `/v1/campaigns/${id}/overrides`,
      query: { email },
    });
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/campaigns/${id}` });
  }
}
