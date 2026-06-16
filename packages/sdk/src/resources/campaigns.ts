import type { RootMail } from "../client";
import type { Campaign, ListResponse } from "../types";

export class Campaigns {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<Campaign>> {
    return this.client.request({ method: "GET", path: "/v1/campaigns" });
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

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/campaigns/${id}` });
  }
}
