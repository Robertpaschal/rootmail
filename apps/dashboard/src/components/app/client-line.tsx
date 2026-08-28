import { Line, type Station } from "@rootmail/design";
import { formatRate, readDrift, readReputation } from "@/lib/reputation";
import type { SubTenant } from "@/lib/types";

/**
 * ONE CLIENT'S BRANCH OFF THE SHARED TRUNK.
 *
 * `docs/design/00-PHILOSOPHY.md` §3.4: sub-tenants share an IP pool and a
 * provider account, and the diagram must not imply otherwise. So the first
 * station is the shared trunk, drawn shared, on every client's line — because
 * it IS shared, and the picture is the disclosure. What follows is theirs: the
 * domain they sign under, and what their mail is doing right now.
 *
 * The throttled case is the one worth reading twice. A metered client is still
 * sending — nothing is dropped, mail waits its turn — so severing the line
 * would be a lie in the other direction. It is drawn as an in-flight segment:
 * a travelling dash on a stroke that is already fully painted, which is exactly
 * what "moving, but not freely" looks like. A paused client is severed, with
 * the number that severed it printed beside the bar.
 */
export function ClientLine({
  tenant,
  scale = "inline",
}: {
  tenant: SubTenant;
  scale?: "inline" | "page";
}) {
  const drift = readDrift(tenant);
  const rep = readReputation(tenant.reputation);
  const state = tenant.reputation.state;

  // The number that explains the state, when the sweep recorded one. A resume
  // makes the stored metrics history, so they are not printed after one.
  const rate =
    !rep.staleSinceResume && rep.metric
      ? formatRate(rep.metric === "bounce" ? rep.bounceRate : rep.complaintRate)
      : null;
  const reason =
    rate && rep.threshold != null
      ? `${rep.metric} rate ${rate} · limit ${formatRate(rep.threshold)}`
      : (tenant.reputation.reason ?? undefined);

  const trunk: Station = {
    label: "Shared pool",
    state: "witnessed",
    at: scale === "page" ? "one provider account, every client" : undefined,
  };

  // The domain station carries the DNS axis, which is independent of reputation:
  // a client can verify perfectly and still be paused for complaints.
  const domain: Station = drift?.stopped
    ? { label: tenant.sending_domain, state: "stopped", reason: drift.detail ?? "records unreachable" }
    : {
        label: tenant.sending_domain,
        state:
          tenant.status === "verified" ? "witnessed" : tenant.status === "failed" ? "stopped" : "unknown",
        at: scale === "page" ? (tenant.status === "verified" ? "DKIM + SPF resolve" : tenant.status) : undefined,
        reason: tenant.status === "failed" ? (drift?.detail ?? "verification failed") : undefined,
      };

  if (domain.state === "stopped") return <Line stations={[trunk, domain]} scale={scale} />;

  const sending: Station =
    state === "paused"
      ? { label: "Paused", state: "stopped", reason }
      : state === "throttled"
        ? {
            label: `Metered${rate ? ` · ${rate}` : ""}`,
            state: "witnessed",
            inFlight: true,
            at: scale === "page" ? reason : undefined,
          }
        : state === "warn"
          ? {
              label: `Flagged${rate ? ` · ${rate}` : ""}`,
              state: "witnessed",
              at: scale === "page" ? (reason ?? "nothing restricted yet") : undefined,
            }
          : {
              label: "Sending",
              state: "witnessed",
              at: scale === "page" ? "within limits" : undefined,
            };

  return (
    <Line
      stations={[trunk, domain, sending]}
      scale={scale}
      label={`${tenant.name}: shared pool, then ${tenant.sending_domain}, then ${sending.label}`}
    />
  );
}
