import type { RootMail } from "../client";
import type { AssistantResponse } from "../types";

export class Assistant {
  constructor(private readonly client: RootMail) {}

  /** Ask the in-app agent to build, operate, or diagnose email. It executes
   * through the gated API under your key, so it inherits your plan/role/AI-credit
   * limits and relays any upgrade prompt. */
  ask(prompt: string): Promise<AssistantResponse> {
    return this.client.request({ method: "POST", path: "/v1/assistant", body: { prompt } });
  }
}
