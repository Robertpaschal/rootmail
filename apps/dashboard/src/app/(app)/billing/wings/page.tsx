import { redirect } from "next/navigation";

// Legacy URL — the one-page, three-ladder view folded every wing together, which
// is exactly what the two-wings doctrine forbids. Each wing now has its own
// dedicated pricing page; old deep links land on Transactional with their query
// intact (the onboarding handoff params carry through to the sibling pages).
export default async function WingsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  redirect(`/billing/transactional${q.size ? `?${q.toString()}` : ""}`);
}
