import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { Errors, generateSessionToken, newId, sha256Hex, type StaffRole } from "@rootmail/core";
import { db, type StaffUser, staffSessions, staffUsers } from "@rootmail/db";

// Staff sessions are deliberately separate from customer sessions, and shorter
// lived — apps/admin authenticates here, never with a customer key/session.
const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function bearer(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return undefined;
  return token.trim();
}

export async function createStaffSession(staffUserId: string) {
  const { token, hash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_MS);
  const [session] = await db
    .insert(staffSessions)
    .values({ id: newId("staffSession"), staffUserId, tokenHash: hash, expiresAt })
    .returning();
  return { token, session };
}

export async function resolveStaffSession(token: string): Promise<StaffUser | null> {
  const [s] = await db
    .select()
    .from(staffSessions)
    .where(eq(staffSessions.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!s || s.expiresAt.getTime() <= Date.now()) return null;
  const [u] = await db.select().from(staffUsers).where(eq(staffUsers.id, s.staffUserId)).limit(1);
  return u ?? null;
}

export async function deleteStaffSession(token: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.tokenHash, sha256Hex(token)));
}

export function staffBearer(req: FastifyRequest): string | undefined {
  return bearer(req);
}

/** Require a valid staff session. Throws 401 otherwise. */
export async function requireStaff(req: FastifyRequest): Promise<StaffUser> {
  const token = bearer(req);
  if (!token) throw Errors.unauthorized("Staff authentication required.");
  const staff = await resolveStaffSession(token);
  if (!staff) throw Errors.unauthorized("Invalid or expired staff session.");
  return staff;
}

/** Require the staff member to hold one of `roles` (superadmin always passes). */
export function requireStaffRole(staff: StaffUser, ...roles: StaffRole[]): void {
  if (staff.role === "superadmin" || roles.includes(staff.role)) return;
  throw Errors.forbidden("Your staff role doesn't allow this.");
}

export function serializeStaff(s: StaffUser) {
  return { object: "staff_user", id: s.id, email: s.email, name: s.name, role: s.role };
}
