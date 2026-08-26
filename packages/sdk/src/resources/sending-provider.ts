import type { RootMail } from "../client";
import type { SendingProviderInfo } from "../types";

/** Connecting your own Amazon SES or Mailgun account. */
export type ConnectProvider =
  | { provider: "ses"; access_key_id: string; secret_access_key: string; region?: string }
  | { provider: "mailgun"; api_key: string; domain: string; region?: "us" | "eu" };

export class SendingProvider {
  constructor(private readonly client: RootMail) {}

  /** What's connected, if anything. Never returns the credentials themselves. */
  get(): Promise<SendingProviderInfo> {
    return this.client.request({ method: "GET", path: "/v1/sending-provider" });
  }

  /**
   * Connect an account. Mail then sends on YOUR credentials and reputation.
   *
   * The credentials are checked against the provider before they are stored, so
   * a rejection here is a real answer — including the common one, that the SES
   * account you connected is itself still sandboxed and can only reach addresses
   * it has verified.
   */
  connect(body: ConnectProvider): Promise<SendingProviderInfo> {
    return this.client.request({ method: "POST", path: "/v1/sending-provider", body });
  }

  /** Disconnect. Sending returns to rootmail's own account. */
  disconnect(): Promise<{ disconnected: boolean; note: string }> {
    return this.client.request({ method: "DELETE", path: "/v1/sending-provider" });
  }
}
