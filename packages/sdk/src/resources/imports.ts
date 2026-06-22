import type { RootMail } from "../client";
import type { ImportResult } from "../types";

export class Imports {
  constructor(private readonly client: RootMail) {}

  /** Bulk-import a suppression list from a previous provider's export. Reasons are
   * normalized (bounce/spam/unsubscribe → bounce/complaint/unsubscribe). */
  suppressions(params: { entries: { email: string; reason?: string }[]; source?: string }): Promise<ImportResult> {
    return this.client.request({ method: "POST", path: "/v1/imports/suppressions", body: params });
  }

  /** Bulk-import contacts (optionally onto a list). Does NOT fire sequence triggers. */
  contacts(params: {
    entries: { email: string; name?: string; tags?: string[] }[];
    listId?: string;
  }): Promise<ImportResult> {
    return this.client.request({
      method: "POST",
      path: "/v1/imports/contacts",
      body: { entries: params.entries, list_id: params.listId },
    });
  }
}
