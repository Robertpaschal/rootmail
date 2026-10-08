/**
 * Seed — or reset — rootmail's own beta-invite automation.
 *
 * The API now creates the template and sequence by itself when they are
 * missing (see beta-automation.ts), and never touches them once they exist.
 * Run this when you WANT the reset: it rewrites the template copy and puts the
 * sequence's steps, trigger and status back to the shipped defaults.
 *
 *   pnpm --filter @rootmail/db exec tsx src/seed-beta-automation.ts
 */
import { BETA_INVITE_SEQUENCE_NAME, BETA_INVITE_TRIGGER_TAG, ensureBetaInviteAutomation } from "./beta-automation";

async function main(): Promise<void> {
  const result = await ensureBetaInviteAutomation({ overwrite: true });
  console.log(
    result.created.length ? `created: ${result.created.join(", ")}` : "template and sequence reset",
    `— "${BETA_INVITE_SEQUENCE_NAME}" → trigger tag: ${BETA_INVITE_TRIGGER_TAG}`,
  );
  for (const w of result.warnings) console.warn("warning:", w);
  if (!result.ok) console.error("NOT RUNNABLE:", result.problems.join(", "));
  process.exit(result.ok ? 0 : 1);
}

void main();
