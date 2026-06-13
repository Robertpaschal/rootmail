import type { ApiKey, SubTenant, Workspace } from "@rootmail/db";

/** Resolved per-request identity, attached by the auth hook. */
export interface AuthContext {
  apiKey: ApiKey;
  workspace: Workspace;
  /** Set when the request is scoped to a sub-tenant (header or body). */
  subTenant: SubTenant | null;
  mode: "live" | "test";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
