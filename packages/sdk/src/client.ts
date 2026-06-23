import { RootMailError } from "./errors";
import { Assistant } from "./resources/assistant";
import { Billing } from "./resources/billing";
import { Campaigns } from "./resources/campaigns";
import { Exports, Retention } from "./resources/compliance";
import { Contacts } from "./resources/contacts";
import { Imports } from "./resources/imports";
import { AnalyticsResource, DeliverabilityResource } from "./resources/insights";
import { Lists } from "./resources/lists";
import { Suppressions } from "./resources/suppressions";
import { Messages } from "./resources/messages";
import { Sequences } from "./resources/sequences";
import { SubTenants } from "./resources/sub-tenants";
import { Templates } from "./resources/templates";
import { Threads } from "./resources/threads";
import { Webhooks } from "./resources/webhooks";
import type { Message, SendParams } from "./types";

export interface RootMailOptions {
  apiKey: string;
  /** API base URL. Defaults to http://localhost:4000. */
  baseUrl?: string;
  /** Scope every request to this sub-tenant (sets the X-Rootmail-Subtenant header). */
  subTenantId?: string;
  /** Custom fetch implementation (defaults to the global fetch). */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class RootMail {
  readonly messages: Messages;
  readonly subTenants: SubTenants;
  readonly contacts: Contacts;
  readonly templates: Templates;
  readonly sequences: Sequences;
  readonly lists: Lists;
  readonly campaigns: Campaigns;
  readonly threads: Threads;
  readonly webhooks: Webhooks;
  readonly deliverability: DeliverabilityResource;
  readonly analytics: AnalyticsResource;
  readonly exports: Exports;
  readonly retention: Retention;
  readonly imports: Imports;
  readonly assistant: Assistant;
  readonly suppressions: Suppressions;
  readonly billing: Billing;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly subTenantId?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RootMailOptions) {
    if (!options.apiKey) throw new Error("rootmail: `apiKey` is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "http://localhost:4000").replace(/\/+$/, "");
    this.subTenantId = options.subTenantId;

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("rootmail: no global fetch found — pass `options.fetch` (Node < 18)");
    }
    this.fetchImpl = fetchImpl;

    this.messages = new Messages(this);
    this.subTenants = new SubTenants(this);
    this.contacts = new Contacts(this);
    this.templates = new Templates(this);
    this.sequences = new Sequences(this);
    this.lists = new Lists(this);
    this.campaigns = new Campaigns(this);
    this.threads = new Threads(this);
    this.webhooks = new Webhooks(this);
    this.deliverability = new DeliverabilityResource(this);
    this.analytics = new AnalyticsResource(this);
    this.exports = new Exports(this);
    this.retention = new Retention(this);
    this.imports = new Imports(this);
    this.assistant = new Assistant(this);
    this.suppressions = new Suppressions(this);
    this.billing = new Billing(this);
  }

  /** Returns a client scoped to a sub-tenant. */
  withSubTenant(subTenantId: string): RootMail {
    return new RootMail({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      subTenantId,
      fetch: this.fetchImpl,
    });
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(this.baseUrl + options.path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.subTenantId) headers["X-Rootmail-Subtenant"] = this.subTenantId;
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    const response = await this.fetchImpl(url.toString(), {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    const json = text ? safeJson(text) : undefined;

    if (!response.ok) {
      const err = (json as { error?: { type?: string; message?: string; details?: unknown } })?.error;
      throw new RootMailError(
        response.status,
        err?.type ?? "error",
        err?.message ?? response.statusText,
        err?.details,
      );
    }

    return json as T;
  }

  /** Convenience shorthand for `client.messages.create(params)`. */
  send(params: SendParams): Promise<Message> {
    return this.messages.create(params);
  }
}
