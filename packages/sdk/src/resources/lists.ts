import type { RootMail } from "../client";
import type { Contact, ContactList, ListResponse, SegmentFilter } from "../types";

export class Lists {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<ContactList>> {
    return this.client.request({ method: "GET", path: "/v1/lists" });
  }

  get(id: string): Promise<ContactList> {
    return this.client.request({ method: "GET", path: `/v1/lists/${id}` });
  }

  create(params: {
    name: string;
    description?: string;
    /**
     * Make this a RULE instead of a membership: the audience describes who is
     * in it, and stays correct on its own as your contacts change. Ideal when
     * you sync your app's users — "everyone on a free plan who never
     * onboarded" beats recomputing a list and pushing tags.
     */
    filter?: SegmentFilter;
  }): Promise<ContactList> {
    return this.client.request({ method: "POST", path: "/v1/lists", body: params });
  }

  /** Change an audience. Pass `filter: null` to turn a rule back into a list. */
  update(
    id: string,
    params: { name?: string; description?: string | null; filter?: SegmentFilter | null },
  ): Promise<ContactList> {
    return this.client.request({ method: "PATCH", path: `/v1/lists/${id}`, body: params });
  }

  /**
   * How many contacts a rule WOULD reach, without saving it.
   *
   * Worth calling before you launch anything: a rule that matches nobody looks
   * exactly like a rule that works, right up until the campaign sends nothing
   * and reports success.
   */
  previewSegment(filter: SegmentFilter): Promise<{ object: "segment_preview"; size: number; describes: string }> {
    return this.client.request({ method: "POST", path: "/v1/lists/preview-segment", body: { filter } });
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
