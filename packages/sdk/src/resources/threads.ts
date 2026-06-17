import type { RootMail } from "../client";
import type { ListResponse, Thread } from "../types";

export class Threads {
  constructor(private readonly client: RootMail) {}

  list(params: { status?: string } = {}): Promise<ListResponse<Thread>> {
    return this.client.request({ method: "GET", path: "/v1/threads", query: params });
  }

  get(id: string): Promise<Thread> {
    return this.client.request({ method: "GET", path: `/v1/threads/${id}` });
  }

  reply(id: string, body: { html?: string; text?: string }): Promise<Thread> {
    return this.client.request({ method: "POST", path: `/v1/threads/${id}/reply`, body });
  }

  /** Test helper — simulate an inbound reply landing on this thread. */
  simulateReply(id: string, body: { body_text?: string } = {}): Promise<Thread> {
    return this.client.request({ method: "POST", path: `/v1/threads/${id}/simulate-reply`, body });
  }
}
