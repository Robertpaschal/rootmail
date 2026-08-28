import type { Metadata } from "next";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import {
  PricingAddons,
  PricingFloor,
  PricingClaim,
  PricingClose,
  PricingEdges,
  PricingIncluded,
  PricingMeters,
} from "@/components/site/pricing-page";
import { getPublicPricing } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two products, each priced by what it uses: transactional email by send volume, marketing email by audience size. Each is free until you outgrow it, and each bills on its own. Sending for your clients is included on every plan — Mailgun gates subaccounts at $90/month. Start free — no card.",
};

/**
 * Seven sections, seven shapes — the composition lives in
 * `components/site/pricing-page.tsx`, which documents why each one is the shape
 * it is. This page's only job is the order and the data fetch.
 *
 * The order is the order of a purchase decision, not of a feature list: the
 * claim, then the number, then the ceiling on the number, then what is NOT
 * behind a plan, then what you can add, then the worries, then the ask.
 */
export default async function PricingPage() {
  const pricing = await getPublicPricing();

  return (
    <>
      <Navbar />
      {/* Slabs sit ON a ground rather than butting against each other; P1 and
          P7 sit on the ground itself, which is what makes them read as speech
          rather than as panels. */}
      <main className="px-3 pb-4 sm:px-5">
        <PricingClaim />
        <PricingMeters pricing={pricing} />
        <PricingFloor pricing={pricing} />
        <PricingIncluded />
        <PricingAddons pricing={pricing} />
        <PricingEdges />
        <PricingClose />
      </main>
      <Footer />
    </>
  );
}
