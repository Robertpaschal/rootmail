import type { RootMail } from "../client";
import type {
  CreatedWebhookEndpoint,
  CreateWebhookParams,
  ListResponse,
  UpdateWebhookParams,
  WebhookDelivery,
  WebhookEndpoint,
} from "../types";

export class Webhooks {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<WebhookEndpoint>> {
    return this.client.request({ method: "GET", path: "/v1/webhook-endpoints" });
  }

  get(id: string): Promise<WebhookEndpoint> {
    return this.client.request({ method: "GET", path: `/v1/webhook-endpoints/${id}` });
  }

  /** Create an endpoint. The signing `secret` is returned only here. */
  create(params: CreateWebhookParams): Promise<CreatedWebhookEndpoint> {
    return this.client.request({ method: "POST", path: "/v1/webhook-endpoints", body: params });
  }

  update(id: string, params: UpdateWebhookParams): Promise<WebhookEndpoint> {
    return this.client.request({ method: "PATCH", path: `/v1/webhook-endpoints/${id}`, body: params });
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/webhook-endpoints/${id}` });
  }

  deliveries(id: string): Promise<ListResponse<WebhookDelivery>> {
    return this.client.request({ method: "GET", path: `/v1/webhook-endpoints/${id}/deliveries` });
  }
}
