import { and, eq, gt, isNull } from "drizzle-orm";
import { ADD_ONS } from "@rootmail/core";
import { db, invitations, memberships, type Organization, orgAddons, workspaces } from "@rootmail/db";
import { planForOrg, workspaceLimitForOrg } from "./plans";

/** Purchased quantity of an add-on for an org (0 if none). */
export async function addonQuantity(organizationId: string, addonId: string): Promise<number> {
  const [row] = await db
    .select({ q: orgAddons.quantity })
    .from(orgAddons)
    .where(and(eq(orgAddons.organizationId, organizationId), eq(orgAddons.addonId, addonId)))
    .limit(1);
  return row?.q ?? 0;
}

export interface SeatState {
  included: number; // -1 = unlimited
  purchased: number;
  /** Effective capacity; Infinity when the plan includes unlimited seats. */
  capacity: number;
  used: number;
  remaining: number;
}

/** Seats used = active members + pending (unexpired, unaccepted) invitations. */
export async function seatState(org: Organization): Promise<SeatState> {
  const included = planForOrg(org).seats;
  const purchased = await addonQuantity(org.id, "extra_seat");

  const members = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.organizationId, org.id));
  const pending = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, org.id),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );

  const used = members.length + pending.length;
  const capacity = included === -1 ? Infinity : included + purchased;
  return {
    included,
    purchased,
    capacity,
    used,
    remaining: capacity === Infinity ? Infinity : capacity - used,
  };
}

export interface WorkspaceState {
  included: number; // -1 = unlimited
  purchased: number;
  /** Effective capacity; Infinity when the plan includes unlimited workspaces. */
  capacity: number;
  used: number;
  remaining: number;
  /** True while another live workspace can be created. */
  canCreate: boolean;
}

/**
 * Live-workspace capacity for an org: plan-included + purchased packs, against
 * the count of the org's LIVE workspaces. The Sandbox (test) workspace is free
 * and never counts. Mirrors seatState.
 */
export async function workspaceState(org: Organization): Promise<WorkspaceState> {
  const included = workspaceLimitForOrg(org);
  const packs = await addonQuantity(org.id, "workspace_pack");
  const purchased = packs * ADD_ONS.workspace_pack.grant;

  const live = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, org.id), eq(workspaces.environment, "live")));

  const used = live.length;
  const capacity = included === -1 ? Infinity : included + purchased;
  return {
    included,
    purchased,
    capacity,
    used,
    remaining: capacity === Infinity ? Infinity : capacity - used,
    canCreate: used < capacity,
  };
}
