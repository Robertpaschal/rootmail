import type { Metadata } from "next";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { Pricing } from "@/components/site/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two products, each priced by what it uses: transactional email by send volume, marketing email by audience size. Add-ons per one. Start free — no card.",
};

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="pt-10">
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
