import type { LeadStatus } from "./types";

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

type BadgeVariant = "default" | "secondary" | "outline" | "witnessed" | "muted";

export function leadStatusVariant(s: LeadStatus): BadgeVariant {
  switch (s) {
    case "new":
      return "default";
    case "contacted":
    case "qualified":
      return "secondary";
    case "proposal":
      return "outline";
    case "won":
      return "witnessed";
    case "lost":
      return "muted";
  }
}
