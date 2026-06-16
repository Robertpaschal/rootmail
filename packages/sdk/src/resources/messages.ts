import type { RootMail } from "../client";
import type { AuditTrail, ListResponse, Message, ProofBundle, SendParams } from "../types";

export class Messages {
  constructor(private readonly client: RootMail) {}

  create(params: SendParams): Promise<Message> {
    const { idempotencyKey, sendAt, subTenantId, replyTo, templateId, ...rest } = params;
    return this.client.request<Message>({
      method: "POST",
      path: "/v1/messages",
      body: {
        ...rest,
        reply_to: replyTo,
        template_id: templateId,
        sub_tenant_id: subTenantId,
        send_at: sendAt instanceof Date ? sendAt.toISOString() : sendAt,
        idempotency_key: idempotencyKey,
      },
      idempotencyKey,
    });
  }

  get(id: string): Promise<Message> {
    return this.client.request<Message>({ method: "GET", path: `/v1/messages/${id}` });
  }

  list(params: { limit?: number; status?: string } = {}): Promise<ListResponse<Message>> {
    return this.client.request<ListResponse<Message>>({
      method: "GET",
      path: "/v1/messages",
      query: params,
    });
  }

  audit(id: string): Promise<AuditTrail> {
    return this.client.request<AuditTrail>({ method: "GET", path: `/v1/messages/${id}/audit` });
  }

  /** The signed Layer-3 proof bundle for a message's lifecycle. */
  proof(id: string): Promise<ProofBundle> {
    return this.client.request<ProofBundle>({ method: "GET", path: `/v1/messages/${id}/proof` });
  }

  /** Record a lifecycle event (open/click/bounce/etc.) — provider callback or simulation. */
  recordEvent(
    id: string,
    event: { event: "delivered" | "opened" | "clicked" | "bounced" | "complained"; url?: string; ip?: string; reason?: string },
  ): Promise<{ ok: boolean; message_id: string; event: string }> {
    return this.client.request({ method: "POST", path: `/v1/messages/${id}/events`, body: event });
  }
}
