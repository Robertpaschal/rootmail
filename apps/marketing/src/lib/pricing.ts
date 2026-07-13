// Live pricing for the marketing site. No backend deps — it fetches the API's
// PUBLIC pricing catalog over HTTP, server-side, so admin edits and sales show
// here too. Falls back to a baked snapshot of the same model if the API is
// unreachable (marketing never hard-depends on the backend being up).
const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface PublicTier {
  id: string;
  wing: "transactional" | "marketing" | "platform";
  name: string;
  rank: number;
  price_monthly: number | null;
  price_yearly: number | null;
  ai_credits: number;
  features: string[];
  included_sends: number | null;
  block_size: number | null;
  allow_overage: boolean;
  overage_per_1000: number;
  included_contacts: number | null;
  per_thousand_cents: number | null;
  sends_per_contact: number | null;
  daily_per_contact: number | null;
  included_audiences: number | null;
  seats: number | null;
  workspace_limit: number | null;
}

export interface PublicAddon {
  id: string;
  name: string;
  unit: string;
  unit_note: string;
  max: number | null;
  group: string;
  description: string;
  unit_amount: number;
  unit_amount_yearly: number;
  sale_percent_off: number | null;
  sale_price: number | null;
  sale_ends_at: string | null;
}

export interface PublicPricing {
  yearly_months_free: number;
  wings: {
    transactional: {
      free_sends: number;
      block_size: number;
      max_blocks: number;
      brackets: { up_to_blocks: number; per_block: number }[];
      tiers: PublicTier[];
    };
    marketing: {
      free_contacts: number;
      contact_steps: number[];
      max_contacts: number;
      tiers: PublicTier[];
    };
  };
  addons: PublicAddon[];
}

// Baked snapshot of the live model (packages/core constants) — the offline
// fallback. Keep the NUMBERS in step when core pricing changes.
export const FALLBACK_PRICING: PublicPricing = {
  yearly_months_free: 2,
  wings: {
    transactional: {
      free_sends: 3_000,
      block_size: 25_000,
      max_blocks: 400,
      brackets: [
        { up_to_blocks: 4, per_block: 8 },
        { up_to_blocks: 20, per_block: 7 },
        { up_to_blocks: 400, per_block: 6 },
      ],
      tiers: [],
    },
    marketing: {
      free_contacts: 500,
      contact_steps: [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000],
      max_contacts: 200_000,
      tiers: [
        mkTier("mk_starter", "Starter", 1, 1200, 12, 1, 3),
        mkTier("mk_growth", "Growth", 2, 1800, 20, 2, 10),
        mkTier("mk_pro", "Pro", 3, 2800, 40, 4, 50),
      ],
    },
  },
  addons: [
    fbAddon("extra_seat", "Team seat", "seat", 8, "One more teammate who can sign in and work in rootmail."),
    fbAddon("workspace_pack", "Workspace", "workspace", 10, "A separate space per product or brand."),
    fbAddon("ai_credit_pack", "AI credits", "pack of 100", 5, "100 more AI assistant actions each month."),
    fbAddon("subtenant_pack", "Client sending domain", "client domain", 2, "Send on behalf of a client from their own verified domain."),
    fbAddon("dedicated_ip", "Dedicated IP", "dedicated IP", 30, "A sending IP only you send from — your reputation is entirely yours."),
    fbAddon("custom_roles", "Custom team roles", "workspace", 15, "Roles that scope exactly what each teammate can do."),
    fbAddon("sso_scim", "SAML SSO + SCIM", "organization", 50, "Sign-in through your identity provider; leavers lose access automatically."),
    fbAddon("proof_exports", "Proof & compliance exports", "organization", 25, "Signed, tamper-evident exports of exactly what you sent."),
    fbAddon("data_residency", "Data residency", "organization", 40, "Pin your data to a region."),
  ],
};

function mkTier(
  id: string,
  name: string,
  rank: number,
  perThousandCents: number,
  sendsPerContact: number,
  dailyPerContact: number,
  audiences: number,
): PublicTier {
  return {
    id,
    wing: "marketing",
    name,
    rank,
    price_monthly: null,
    price_yearly: null,
    ai_credits: 0,
    features: [],
    included_sends: null,
    block_size: null,
    allow_overage: false,
    overage_per_1000: 0,
    included_contacts: null,
    per_thousand_cents: perThousandCents,
    sends_per_contact: sendsPerContact,
    daily_per_contact: dailyPerContact,
    included_audiences: audiences,
    seats: null,
    workspace_limit: null,
  };
}

function fbAddon(id: string, name: string, unit: string, amount: number, description: string): PublicAddon {
  return {
    id,
    name,
    unit,
    unit_note: `priced per ${unit}`,
    max: null,
    group: "platform",
    description,
    unit_amount: amount,
    unit_amount_yearly: amount * 10,
    sale_percent_off: null,
    sale_price: null,
    sale_ends_at: null,
  };
}

/** The live public catalog, or the baked fallback. Cached ~60s (ISR). */
export async function getPublicPricing(): Promise<PublicPricing> {
  try {
    const res = await fetch(new URL("/v1/pricing", API_URL), { next: { revalidate: 60 } });
    if (!res.ok) return FALLBACK_PRICING;
    const json = (await res.json()) as Partial<PublicPricing>;
    if (!json.wings || !json.addons) return FALLBACK_PRICING;
    return {
      yearly_months_free: json.yearly_months_free ?? 2,
      wings: json.wings,
      addons: json.addons,
    };
  } catch {
    return FALLBACK_PRICING;
  }
}
