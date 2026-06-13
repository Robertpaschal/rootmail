import type { ApiKey, SubTenant, User, Workspace } from "@rootmail/db";

/** Resolved per-request identity, attached by the auth hook. */
export interface AuthContext {
  /** Present when authenticated with an API key (SDK / external). */
  apiKey: ApiKey | null;
  /** Present when authenticated with a dashboard session token. */
  user: User | null;
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
