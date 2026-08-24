/**
 * DKIM key rotation with dual-selector overlap (brief P2.3).
 *
 * The rule everything else follows: **we keep signing with the OLD key until the
 * new record actually resolves.** Cutting over first would fail authentication
 * on every message sent in the gap — which is exactly the outage rotation exists
 * to avoid. So a rotation in flight is harmless by construction: worst case the
 * customer never publishes the record and nothing changes.
 *
 * Symmetrically, the old record must OUTLIVE the cutover. A receiver can verify
 * a message long after accepting it (greylisting, deferred queues, forwarded
 * copies) and it verifies against the selector the message was signed with.
 *
 * Pure and dependency-free, so the promise "rotating never drops a message" is
 * something a test can hold us to.
 */
import {
  DKIM_PREVIOUS_RETIRE_DAYS,
  DKIM_ROTATION_AGE_DAYS,
  DKIM_ROTATION_STALL_DAYS,
} from "./constants";

const DAY_MS = 86_400_000;

export type DkimRotationAction =
  /** Nothing to do. */
  | { action: "none" }
  /** Key is old enough — generate the next one and ask for its record. */
  | { action: "start" }
  /** The pending record resolves. Swap it in; the old selector begins retiring. */
  | { action: "promote" }
  /** Started but unpublished for a long time. A nag, never an enforcement. */
  | { action: "stalled"; daysWaiting: number }
  /** The retired selector has outlived every plausible deferral. Safe to drop. */
  | { action: "retire" };

export interface DkimRotationInput {
  /** Does the PENDING selector's DNS record resolve? Irrelevant if none pending. */
  pendingResolves: boolean;
  /** When the in-flight rotation began, or null if none is in flight. */
  rotationStartedAt: Date | null;
  /** Whether a pending keypair exists at all. */
  hasPending: boolean;
  /** Last completed cutover; null means the key is the original one. */
  rotatedAt: Date | null;
  /** When this tenant was first verified — the original key's birthday. */
  verifiedAt: Date | null;
  /** A previous selector still published, and when it may be dropped. */
  previousRetireAt: Date | null;
  now: Date;
  /** Whether age-based rotation may START on its own. */
  autoStart: boolean;
}

export function decideDkimRotation(input: DkimRotationInput): DkimRotationAction {
  const {
    pendingResolves, rotationStartedAt, hasPending, rotatedAt, verifiedAt,
    previousRetireAt, now, autoStart,
  } = input;

  // Retiring an old selector is independent of everything else and comes first:
  // it is pure cleanup and must not be blocked by a rotation that started since.
  if (previousRetireAt && now >= previousRetireAt) return { action: "retire" };

  if (hasPending) {
    if (pendingResolves) return { action: "promote" };
    const waited = rotationStartedAt ? (now.getTime() - rotationStartedAt.getTime()) / DAY_MS : 0;
    // Report it once it is clearly not "they'll get to it today", not before.
    if (waited >= DKIM_ROTATION_STALL_DAYS) return { action: "stalled", daysWaiting: Math.floor(waited) };
    return { action: "none" };
  }

  if (!autoStart) return { action: "none" };

  // Age is measured from the last cutover, or from first verification for a key
  // that has never been rotated. An unverified tenant has no key in use yet.
  const born = rotatedAt ?? verifiedAt;
  if (!born) return { action: "none" };
  const ageDays = (now.getTime() - born.getTime()) / DAY_MS;
  return ageDays >= DKIM_ROTATION_AGE_DAYS ? { action: "start" } : { action: "none" };
}

/** The selector to use for the next key. Deterministic, and never reused. */
export function nextDkimSelector(current: string, now: Date): string {
  // Date-stamped rather than incremented: a selector must never collide with one
  // still published, and a counter resets if a row is ever rebuilt from defaults.
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const base = current.replace(/\d{6}$/, "").replace(/-+$/, "") || "rootmail";
  const candidate = `${base}-${stamp}`;
  // Same month as the current selector (a re-rotation) — disambiguate rather
  // than publish a record that overwrites the one still in use.
  return candidate === current ? `${candidate}b` : candidate;
}

/** When a selector we just rotated away from may safely be deleted. */
export function previousRetireAt(cutoverAt: Date): Date {
  return new Date(cutoverAt.getTime() + DKIM_PREVIOUS_RETIRE_DAYS * DAY_MS);
}
