import type { RootMail } from "../client";
import type { Contact, UpsertContactParams } from "../types";

export class Contacts {
  constructor(private readonly client: RootMail) {}

  upsert(params: UpsertContactParams): Promise<Contact> {
    return this.client.request<Contact>({ method: "POST", path: "/v1/contacts", body: params });
  }

  get(email: string): Promise<Contact> {
    return this.client.request<Contact>({
      method: "GET",
      path: `/v1/contacts/${encodeURIComponent(email)}`,
    });
  }

  unsubscribe(email: string): Promise<{ ok: boolean; email: string; status: string }> {
    return this.client.request({
      method: "POST",
      path: "/v1/contacts/unsubscribe",
      body: { email },
    });
  }

  async isSuppressed(email: string): Promise<boolean> {
    const result = await this.client.request<{ email: string; suppressed: boolean }>({
      method: "GET",
      path: "/v1/suppressions/check",
      query: { email },
    });
    return result.suppressed;
  }
}
