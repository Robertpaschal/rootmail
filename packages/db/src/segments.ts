import { type SQL, and, eq, or, sql } from "drizzle-orm";
import { contacts } from "./schema";

/**
 * Audiences that describe themselves — "everyone on Free who hasn't verified a
 * domain" — instead of holding a frozen list of ids.
 *
 * This came out of making rootmail reach its own customers with rootmail. The
 * outreach we need is all conditional: dormant twenty-one days, approaching a
 * cap, on a trial ending this week. Today the only way to express that is to
 * compute it somewhere else and push tags in, which is exactly the "our product
 * can't do our job" problem we set out to fix — and every customer who syncs
 * their app's users has the identical need, so this is a product feature, not
 * plumbing for us. A static audience remains a static audience; `filter` is
 * simply how an audience says it is a rule instead.
 *
 * ── THE SECURITY SURFACE ────────────────────────────────────────────────────
 * This turns caller-supplied JSON into SQL, which is where injection lives. The
 * rules here are absolute:
 *
 *   1. Field names are NEVER interpolated. `FIELDS` maps an allowed name to a
 *      column reference we wrote ourselves; anything not in that map is
 *      rejected outright. A caller cannot name a column, a table, or a function.
 *   2. Trait keys ARE caller-supplied, so they go in as a bound PARAMETER to
 *      `->>`, never concatenated. `metadata ->> $1` is safe; building the string
 *      would not be.
 *   3. Every value is a bound parameter, always, including inside LIKE — where
 *      the wildcards are added around the parameter, not inside the string.
 *   4. Operators are looked up in a fixed table. An unknown operator is an
 *      error, never a pass-through.
 *   5. The rule is bounded: a capped number of conditions and no nesting, so a
 *      hostile rule cannot become a query-planner denial of service. Depth is
 *      the usual way these evaluators get turned into a weapon.
 *
 * A rule that fails validation throws. It never silently degrades into "match
 * everything" — a segment that quietly widened would mail people who were meant
 * to be excluded, which is worse than an error.
 */

/** Bounded on purpose — see rule 5. */
export const MAX_CONDITIONS = 25;

export type SegmentOp =
  | "eq"
  | "neq"
  | "contains"
  | "exists"
  | "not_exists"
  | "before"
  | "after";

export interface SegmentCondition {
  /** An allowed field name, or `trait:<key>` for a synced attribute. */
  field: string;
  op: SegmentOp;
  value?: string | number | boolean | null;
}

export interface SegmentFilter {
  /** "all" = AND (default), "any" = OR. */
  match?: "all" | "any";
  conditions: SegmentCondition[];
}

/**
 * The only fields a rule may name. The VALUE is a column reference we control;
 * the KEY is what a caller is allowed to say. Nothing here is built from input.
 */
const FIELDS = {
  email: () => sql`${contacts.email}`,
  name: () => sql`${contacts.name}`,
  status: () => sql`${contacts.status}`,
  stage: () => sql`${contacts.stage}`,
  created_at: () => sql`${contacts.createdAt}`,
  updated_at: () => sql`${contacts.updatedAt}`,
} as const;

const TRAIT_PREFIX = "trait:";
/** Conservative: letters, digits, underscore, dot, dash. Bound as a parameter
 *  regardless — this only keeps obvious nonsense out of the audience UI. */
const TRAIT_KEY = /^[A-Za-z0-9_.-]{1,64}$/;

function columnFor(field: string): SQL {
  if (field === "tag") {
    // Tags are a JSON array; handled by the operator, which needs containment
    // semantics rather than comparison. Returned so the op can special-case it.
    return sql`${contacts.tags}`;
  }
  if (field.startsWith(TRAIT_PREFIX)) {
    const key = field.slice(TRAIT_PREFIX.length);
    if (!TRAIT_KEY.test(key)) throw new Error(`Invalid trait key: ${key}`);
    // The key is a BOUND PARAMETER. This is the one place caller input reaches
    // the query shape, and it must stay parameterised — see rule 2.
    return sql`(${contacts.metadata} ->> ${key})`;
  }
  const col = FIELDS[field as keyof typeof FIELDS];
  if (!col) throw new Error(`Unknown segment field: ${field}`);
  return col();
}

function conditionSql(c: SegmentCondition): SQL {
  // Tags need containment, not comparison — a contact "has" a tag.
  if (c.field === "tag") {
    if (c.op === "eq" || c.op === "contains") {
      return sql`${contacts.tags} @> ${JSON.stringify([String(c.value ?? "")])}::jsonb`;
    }
    if (c.op === "neq") {
      return sql`NOT (${contacts.tags} @> ${JSON.stringify([String(c.value ?? "")])}::jsonb)`;
    }
    throw new Error(`Operator ${c.op} is not valid for tags`);
  }

  const col = columnFor(c.field);
  switch (c.op) {
    case "eq":
      return sql`${col} = ${c.value}`;
    case "neq":
      // IS DISTINCT FROM so a NULL trait counts as "not equal" rather than
      // dropping the row — otherwise "plan is not enterprise" would silently
      // exclude every contact who has no plan trait at all.
      return sql`${col} IS DISTINCT FROM ${c.value}`;
    case "contains":
      // Wildcards wrap the PARAMETER; the value itself is never concatenated.
      return sql`${col} ILIKE '%' || ${String(c.value ?? "")} || '%'`;
    case "exists":
      return sql`${col} IS NOT NULL`;
    case "not_exists":
      return sql`${col} IS NULL`;
    case "before":
      return sql`${col} < ${c.value}`;
    case "after":
      return sql`${col} > ${c.value}`;
    default:
      // Exhaustive by the type, but a hand-written JSON rule can still carry
      // anything — so this must reject rather than fall through.
      throw new Error(`Unknown segment operator: ${String((c as SegmentCondition).op)}`);
  }
}

/** Validate a rule, throwing with a reason a person can act on. */
export function validateSegmentFilter(filter: unknown): SegmentFilter {
  if (!filter || typeof filter !== "object") throw new Error("A segment rule must be an object.");
  const f = filter as SegmentFilter;
  if (!Array.isArray(f.conditions) || f.conditions.length === 0) {
    throw new Error("A segment rule needs at least one condition.");
  }
  if (f.conditions.length > MAX_CONDITIONS) {
    throw new Error(`A segment rule may hold at most ${MAX_CONDITIONS} conditions.`);
  }
  if (f.match && f.match !== "all" && f.match !== "any") {
    throw new Error('A segment rule matches "all" or "any".');
  }
  // Compiling each condition is the validation: anything unknown throws here,
  // at save time, rather than at send time against a real audience.
  for (const c of f.conditions) conditionSql(c);
  return { match: f.match ?? "all", conditions: f.conditions };
}

/**
 * The WHERE clause for a rule, already scoped to a workspace (and client).
 *
 * Scoping is applied HERE rather than left to the caller: a segment that
 * escaped its workspace would mail another tenant's contacts, so it must not be
 * possible to build one of these without it.
 */
export function segmentWhere(
  filter: SegmentFilter,
  workspaceId: string,
  subTenantId: string | null,
): SQL {
  const valid = validateSegmentFilter(filter);
  const parts = valid.conditions.map(conditionSql);
  const rule = valid.match === "any" ? or(...parts) : and(...parts);

  const scope = subTenantId
    ? and(eq(contacts.workspaceId, workspaceId), eq(contacts.subTenantId, subTenantId))
    : and(eq(contacts.workspaceId, workspaceId), sql`${contacts.subTenantId} IS NULL`);

  // Never mail a contact who has left. A rule cannot opt out of this.
  return and(scope, eq(contacts.status, "active"), rule) as SQL;
}

/** A human sentence for a rule, for the audience header and campaign review. */
export function describeSegment(filter: SegmentFilter): string {
  const label = (c: SegmentCondition) => {
    const field = c.field.startsWith(TRAIT_PREFIX) ? c.field.slice(TRAIT_PREFIX.length) : c.field;
    switch (c.op) {
      case "exists":
        return `${field} is set`;
      case "not_exists":
        return `${field} is not set`;
      case "neq":
        return `${field} is not ${c.value}`;
      case "contains":
        return `${field} contains “${c.value}”`;
      case "before":
        return `${field} is before ${c.value}`;
      case "after":
        return `${field} is after ${c.value}`;
      default:
        return `${field} is ${c.value}`;
    }
  };
  const joiner = filter.match === "any" ? " or " : " and ";
  return filter.conditions.map(label).join(joiner);
}
