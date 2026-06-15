import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env, Errors, MEMBERSHIP_ROLES, newId, PLANS, randomToken, sha256Hex } from "@rootmail/core";
import { db, invitations, memberships, organizations, orgAddons, roles, users } from "@rootmail/db";
import { loadOrg, requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { seatState } from "../lib/seats";
import { parse } from "../lib/validate";

const inviteBody = z.object({
  email: z.string().email(),
  role: z.enum(MEMBERSHIP_ROLES).default("member"),
  custom_role_id: z.string().optional(),
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function memberRoutes(app: FastifyInstance): Promise<void> {
  // --- List members + pending invites + seat usage ------------------------
  app.get("/v1/members", async (req) => {
    const org = await loadOrg(req);
    const members = await db
      .select({
        id: memberships.id,
        role: memberships.role,
        userId: users.id,
        email: users.email,
        name: users.name,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, org.id));
    const invites = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, org.id),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    const seats = await seatState(org);
    return {
      object: "members",
      // Infinity doesn't survive JSON; expose unlimited as -1.
      seats: {
        included: seats.included,
        purchased: seats.purchased,
        used: seats.used,
        capacity: seats.capacity === Infinity ? -1 : seats.capacity,
        remaining: seats.remaining === Infinity ? -1 : seats.remaining,
      },
      members: members.map((m) => ({
        id: m.id,
        user_id: m.userId,
        email: m.email,
        name: m.name,
        role: m.role,
        created_at: m.createdAt.toISOString(),
      })),
      invitations: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expires_at: i.expiresAt.toISOString(),
      })),
    };
  });

  // --- Invite (seat-capacity gated, race-safe) ----------------------------
  app.post("/v1/invitations", async (req, reply) => {
    const body = parse(inviteBody, req.body);
    const org = await loadOrg(req);
    await requirePermission(req, "members.manage");
    const email = body.email.toLowerCase();
    const token = randomToken(24);

    // Assigning a custom role requires the rbac feature (Scale) + a real role.
    let customRoleId: string | null = null;
    if (body.custom_role_id) {
      await requireFeature(req, "rbac");
      const [r] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.id, body.custom_role_id), eq(roles.organizationId, org.id)))
        .limit(1);
      if (!r) throw Errors.notFound(`Role ${body.custom_role_id} not found`);
      customRoleId = r.id;
    }

    const invitation = await db.transaction(async (tx) => {
      // Lock the org row so concurrent invites can't both slip past capacity.
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .for("update");

      const included = PLANS[org.plan].seats;
      const [pq] = await tx
        .select({ q: orgAddons.quantity })
        .from(orgAddons)
        .where(and(eq(orgAddons.organizationId, org.id), eq(orgAddons.addonId, "extra_seat")))
        .limit(1);
      const purchased = pq?.q ?? 0;

      const members = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.organizationId, org.id));
      const pending = await tx
        .select({ id: invitations.id, email: invitations.email })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, org.id),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        );
      if (pending.some((p) => p.email.toLowerCase() === email)) {
        throw Errors.conflict("That email already has a pending invitation.");
      }

      const capacity = included === -1 ? Infinity : included + purchased;
      if (members.length + pending.length >= capacity) {
        throw Errors.featureLocked("seats", {
          current_plan: org.plan,
          required_plan: null,
          message: `All ${capacity} seats are in use. Buy an extra seat or upgrade your plan to add more.`,
          upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
          checkout_endpoint: 'POST /v1/billing/addons {"addon_id":"extra_seat","quantity":N}',
        });
      }

      const [inv] = await tx
        .insert(invitations)
        .values({
          id: newId("invitation"),
          organizationId: org.id,
          email,
          role: body.role,
          customRoleId,
          tokenHash: sha256Hex(token),
          invitedBy: req.auth.user?.id ?? null,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning();
      return inv;
    });

    return reply.status(201).send({
      object: "invitation",
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      // Token shown once — the invitee accepts with it.
      token,
      accept_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/accept-invite?token=${token}`,
      expires_at: invitation.expiresAt.toISOString(),
    });
  });

  // --- Revoke a pending invite --------------------------------------------
  app.delete("/v1/invitations/:id", async (req) => {
    const { id } = req.params as { id: string };
    const org = await loadOrg(req);
    await requirePermission(req, "members.manage");
    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.organizationId, org.id)))
      .limit(1);
    if (!inv) throw Errors.notFound(`Invitation ${id} not found`);
    await db.delete(invitations).where(eq(invitations.id, inv.id));
    return { object: "invitation", id: inv.id, deleted: true };
  });

  // --- Accept an invite (the invitee, signed in with the invited email) ----
  app.post("/v1/invitations/accept", async (req) => {
    const { token } = parse(z.object({ token: z.string().min(1) }), req.body);
    if (!req.auth.user) throw Errors.forbidden("Sign in to accept an invitation.");
    const user = req.auth.user;

    const [inv] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256Hex(token)))
      .limit(1);
    if (!inv || inv.acceptedAt || inv.expiresAt.getTime() <= Date.now()) {
      throw Errors.badRequest("Invalid or expired invitation.");
    }
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw Errors.forbidden("This invitation was sent to a different email.");
    }

    const [existing] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, inv.organizationId)))
      .limit(1);
    if (!existing) {
      await db.insert(memberships).values({
        id: newId("membership"),
        userId: user.id,
        organizationId: inv.organizationId,
        role: inv.role,
        customRoleId: inv.customRoleId ?? null,
      });
    }
    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    return { object: "invitation", id: inv.id, accepted: true, organization_id: inv.organizationId };
  });
}
