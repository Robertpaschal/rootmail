// Live pricing for the marketing cards. The marketing site has no backend deps —
// it just fetches the API's PUBLIC pricing catalog over HTTP, server-side, so an
// admin-set sale shows here too. Falls back to the static prices if the API is
// unreachable (marketing never hard-depends on the backend being up).
const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface PublicPlan {
  id: string;
  price: number | null;
  price_yearly: number | null;
  sale_percent_off: number | null;
  sale_ends_at: string | null;
  sale_price: number | null;
  sale_price_yearly: number | null;
}

/** Map of planId → live pricing, or empty on any failure. Cached ~60s (ISR). */
export async function getPublicPricing(): Promise<Record<string, PublicPlan>> {
  try {
    const res = await fetch(new URL("/v1/pricing", API_URL), { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: PublicPlan[] };
    const map: Record<string, PublicPlan> = {};
    for (const p of json.data ?? []) map[p.id] = p;
    return map;
  } catch {
    return {};
  }
}
