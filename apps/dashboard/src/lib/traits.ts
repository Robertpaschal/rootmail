/**
 * Contact-trait presentation rules, mirrored from `@rootmail/core`.
 *
 * Deliberately duplicated rather than imported: these are used from a "use
 * client" component, and `@rootmail/core` reaches env validation, crypto and
 * the AWS SDK — none of which belong in a browser bundle. They are two pure
 * string functions, and `packages/core/src/constants.ts` stays the canon that
 * the API, worker and docs use. Keep them in step.
 */

/**
 * A trait whose key starts with `_` is PRIVATE: stored, segmentable, never
 * displayed on the contact record.
 *
 * Syncing an app's users always drags along keys that exist to JOIN, not to
 * read — a primary key, an internal tier code, a billing counter. We found this
 * by dogfooding: our own customer sync put five of them on every contact and
 * the record dutifully rendered `organization_id: org_8pgwbdw5xioqmpkjncire54y`.
 */
export function isPrivateTrait(key: string): boolean {
  return key.startsWith("_");
}

/** A trait key as a person reads it: `signed_up_at` → "Signed up at". */
export function traitLabel(key: string): string {
  const words = key.replace(/^_/, "").replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
