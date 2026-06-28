import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ADD_ONS, env, Errors, newId } from "@rootmail/core";
import { db, organizations, orgAddons, workspaces } from "@rootmail/db";
import { loadOrg } from "../lib/features";
import { workspaceLimitForOrg } from "../lib/plans";
import { requirePermission } from "../lib/permissions";
import { workspaceState } from "../lib/seats";
import { serializeWorkspace } from "../lib/serialize";
import { parse } from "../lib/validate";

const createBody = z.object({ name: z.string().min(1).max(120) });

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * A slug unique within the org — appends -2, -3, … on collision. Reads through
 * the passed executor (the open txn) so it sees the locked, consistent state;
 * the DB's per-org unique index is the final backstop.
 */
async function uniqueSlug(
  exec: Pick<typeof db, "select">,
  organizationId: string,
  base: string,
): Promise<string> {
  const root = base || "workspace";
  const taken = new Set(
    (
      await exec
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.organizationId, organizationId))
    ).map((w) => w.slug),
  );
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // --- List the caller's org workspaces -----------------------------------
  app.get("/v1/workspaces", async (req) => {
    const org = await loadOrg(req);
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, org.id))
      .orderBy(asc(workspaces.createdAt));
    const state = await workspaceState(org);
    return {
      object: "list",
      data: rows.map(serializeWorkspace),
      // Infinity doesn't survive JSON; expose unlimited as -1.
      workspaces_limit: {
        included: state.included,
        purchased: state.purchased,
        used: state.used,
        capacity: state.capacity === Infinity ? -1 : state.capacity,
        remaining: state.remaining === Infinity ? -1 : state.remaining,
        can_create: state.canCreate,
      },
    };
  });

  // --- Create a new LIVE workspace (capacity-gated, race-safe) ------------
  app.post("/v1/workspaces", async (req, reply) => {
    const org = await loadOrg(req);
    await requirePermission(req, "billing.manage");
    const body = parse(createBody, req.body);

    const workspace = await db.transaction(async (tx) => {
      // Lock the org row so concurrent creates can't both slip past capacity.
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .for("update");

      // Re-evaluate capacity under the lock (mirrors workspaceState, but inside
      // the txn so two concurrent creates can't both pass). Sandbox never counts.
      const included = workspaceLimitForOrg(org);
      const [pq] = await tx
        .select({ q: orgAddons.quantity })
        .from(orgAddons)
        .where(and(eq(orgAddons.organizationId, org.id), eq(orgAddons.addonId, "workspace_pack")))
        .limit(1);
      const purchased = (pq?.q ?? 0) * ADD_ONS.workspace_pack.grant;
      const live = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.organizationId, org.id), eq(workspaces.environment, "live")));
      const capacity = included === -1 ? Infinity : included + purchased;

      if (live.length >= capacity) {
        throw Errors.quotaExceeded(
          `You've reached your ${capacity} workspace limit. Add a workspace pack or upgrade your plan.`,
          {
            feature: "workspaces",
            used: live.length,
            capacity: capacity === Infinity ? -1 : capacity,
            upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
            checkout_endpoint: 'POST /v1/billing/addons {"addon_id":"workspace_pack","quantity":N}',
          },
        );
      }

      const slug = await uniqueSlug(tx, org.id, slugify(body.name));
      const [row] = await tx
        .insert(workspaces)
        .values({
          id: newId("workspace"),
          organizationId: org.id,
          name: body.name,
          slug,
          environment: "live",
        })
        .returning();
      return row;
    });

    return reply.status(201).send(serializeWorkspace(workspace));
  });

  // --- Rename a workspace (display name only; slug + environment immutable) ----
  app.patch("/v1/workspaces/:id", async (req, reply) => {
    const org = await loadOrg(req);
    await requirePermission(req, "billing.manage");
    const { id } = req.params as { id: string };
    const { name } = parse(z.object({ name: z.string().min(1).max(120) }), req.body);

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.organizationId, org.id)))
      .limit(1);
    if (!ws) throw Errors.notFound("Workspace not found");

    const [updated] = await db
      .update(workspaces)
      .set({ name })
      .where(eq(workspaces.id, id))
      .returning();
    return reply.send(serializeWorkspace(updated));
  });
}
