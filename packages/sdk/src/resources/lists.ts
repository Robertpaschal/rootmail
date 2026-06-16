import type { RootMail } from "../client";
import type { Contact, ContactList, ListResponse } from "../types";

export class Lists {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<ContactList>> {
    return this.client.request({ method: "GET", path: "/v1/lists" });
  }

  get(id: string): Promise<ContactList> {
    return this.client.request({ method: "GET", path: `/v1/lists/${id}` });
  }

  create(params: { name: string; description?: string }): Promise<ContactList> {
    return this.client.request({ method: "POST", path: "/v1/lists", body: params });
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/lists/${id}` });
  }

  contacts(id: string): Promise<ListResponse<Contact>> {
    return this.client.request({ method: "GET", path: `/v1/lists/${id}/contacts` });
  }

  addContact(id: string, email: string): Promise<{ contact_id: string }> {
    return this.client.request({ method: "POST", path: `/v1/lists/${id}/contacts`, body: { email } });
  }

  removeContact(id: string, contactId: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/lists/${id}/contacts/${contactId}` });
  }
}
