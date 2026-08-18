import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, computeDeliverability } from "@rootmail/core";
import { reputationSnapshotInput } from "@rootmail/db";
import { parse } from "../lib/validate";

const query = z.object({
  window_days: z.coerce.number().int().min(1).max(90).default(30),
  sub_tenant_id: z.string().optional(),
});

export async function deliverabilityRoutes(app: FastifyInstance): Promise<void> {
  // Reputation snapshot from real send outcomes (+ domain-auth health). Read-only,
  // workspace-scoped; pass ?sub_tenant_id= to scope to one sending domain.
  app.get("/v1/deliverability", async (req) => {
    const q = parse(query, req.query);
    // Auth scope PINS this; a query param may narrow nothing and override
    // nothing. "Explicit param wins" is how a client-scoped key reads a
    // sibling's numbers — proven live: a key pinned to A passed
    // ?sub_tenant_id=B and got B's bounce rate back. The header is rejected at
    // the plugin, so the param was simply walking around the lock.
    const authScope = req.auth.subTenant?.id ?? null;
    if (authScope && q.sub_tenant_id && q.sub_tenant_id !== authScope) {
      throw Errors.badRequest("sub_tenant_id conflicts with the X-Rootmail-Subtenant header");
    }
    const st = authScope ?? q.sub_tenant_id ?? undefined;

    // The sampling lives in @rootmail/db because the worker's reputation sweep
    // runs the SAME queries against the SAME scorer. When this route and the
    // enforcement loop disagree about a tenant's numbers, the operator is told
    // their client is fine while we throttle it — so there is one implementation.
    //
    // Note this read path counts sandbox sends and the sweep does not: the
    // dashboard of a sandbox workspace should describe the sandbox, but nobody's
    // client should be paused because a developer ran the bounce scenario.
    const snapshot = await reputationSnapshotInput({
      workspaceId: req.auth.workspace.id,
      subTenantId: st,
      windowDays: q.window_days,
    });

    const result = computeDeliverability(snapshot);

    return { object: "deliverability", scope: { sub_tenant_id: st ?? null }, ...result };
  });
}
