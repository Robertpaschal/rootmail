import type { Metadata } from "next";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { Pricing } from "@/components/site/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free. Pay when you scale. The same rootmail API at every tier.",
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
