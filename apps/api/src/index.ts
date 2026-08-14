import { env } from "@rootmail/core";
import { closeDb, ensureInternalAccount } from "@rootmail/db";
import { promoteVerifiedTesters } from "./lib/beta-waitlist";
import { refreshPlanCache } from "./lib/plans";
import { refreshTierCache } from "./lib/wings";
import { buildServer } from "./server";

async function main() {
  await Promise.all([refreshPlanCache(), refreshTierCache()]); // warm the DB-backed pricing caches before serving
  const app = await buildServer();

  // rootmail's own account, so we can reach our customers with our own product.
  // Idempotent (fixed slug) and non-fatal: this is plumbing for OUR outreach,
  // and a hiccup here must never stop the API from serving customers.
  try {
    const internal = await ensureInternalAccount();
    if (internal.created) app.log.info({ ...internal }, "bootstrapped the internal rootmail account");
  } catch (err) {
    app.log.error({ err }, "could not ensure the internal rootmail account");
  }

  await app.listen({ port: env.API_PORT, host: env.API_HOST });

  /*
   * Beta invites wait for verification.
   *
   * A tester clicks the link in Amazon's mail and nothing in our system hears
   * about it, so we ask on a short interval and tag them ready the moment SES
   * says yes — which is what fires their invite sequence. Before this, signup
   * requested verification and triggered the sequence in the same breath: SES
   * refused the unverified recipient, the enrollment completed, and the invite
   * was never retried. Every tester on a real address hit it; only our own
   * pre-verified @rootmail.io addresses made it look like it worked.
   *
   * A plain interval, not a queue: it touches a handful of rows for a beta of
   * eight, and a failure is retried two minutes later by construction.
   */
  const promoteTimer = setInterval(() => {
    void promoteVerifiedTesters()
      .then((n) => {
        if (n > 0) app.log.info({ promoted: n }, "beta testers verified — invites triggered");
      })
      .catch((err) => app.log.error({ err }, "beta promotion sweep failed"));
  }, 120_000);
  // Don't hold the process open on shutdown.
  promoteTimer.unref?.();

  const shutdown = async (signal: string) => {
    clearInterval(promoteTimer);
    app.log.info(`${signal} received — shutting down`);
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
