import type { Metadata } from "next";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { Pricing } from "@/components/site/pricing";
import { PricingArgument } from "@/components/site/pricing-argument";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two products, each priced by what it uses: transactional email by send volume, marketing email by audience size. Each is free until you outgrow it, and each bills on its own. Sending for your clients is included on every plan — Mailgun gates subaccounts at $90/month. Start free — no card.",
};

/**
 * The page opens with its own h1 and its own argument now, instead of being two
 * homepage sections stacked. `PricingArgument` carries the h1; `Pricing` keeps
 * its default h2 so the outline is correct.
 */
export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main>
        <PricingArgument />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
