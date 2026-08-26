import type { RootMail } from "../client";
import type { DataSubjectExport, ErasureResult } from "../types";

/**
 * Data-subject requests (GDPR Articles 15 and 17).
 *
 * For when one of your recipients asks what you hold about them, or asks you to
 * delete it. You have 30 days; this is not the moment to be writing queries.
 */
export class Privacy {
  constructor(private readonly client: RootMail) {}

  /** Everything held about one email address. Excludes message bodies. */
  export(params: { email: string }): Promise<DataSubjectExport> {
    return this.client.request({ method: "POST", path: "/v1/privacy/export", body: params });
  }

  /**
   * Erase a recipient. The confirmation is required, not a formality.
   *
   * Their suppression entry is deliberately KEPT — deleting it would mean your
   * next campaign emails them again, which is the opposite of what they asked
   * for. Messages are redacted rather than deleted, so you keep the proof you
   * were entitled to send them without keeping them.
   */
  erase(params: { email: string; confirm: true }): Promise<ErasureResult> {
    return this.client.request({ method: "POST", path: "/v1/privacy/erase", body: params });
  }
}
