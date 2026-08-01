// Plain module — deliberately NOT "use client".
//
// These live apart from launch.tsx because a server component needs to CALL
// phaseForStatus(), and Next only lets components cross the client boundary,
// never arbitrary functions. Keeping the type and the mapping here means both
// sides can use them; launch.tsx imports the type back for its props.

export const CAMPAIGN_JOURNEY = ["Build", "Review", "Sending", "Delivered", "Engagement"] as const;
export type CampaignPhase = (typeof CAMPAIGN_JOURNEY)[number];

/** Where a saved campaign sits on the rail. */
export function phaseForStatus(status: "draft" | "scheduled" | "sending" | "sent"): CampaignPhase {
  if (status === "draft" || status === "scheduled") return "Review";
  if (status === "sending") return "Sending";
  return "Delivered";
}
