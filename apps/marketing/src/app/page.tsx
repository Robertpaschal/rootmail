import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { WhoItsFor } from "@/components/site/who-its-for";
import { LayerModel } from "@/components/site/layer-model";
import { Features } from "@/components/site/features";
import { SubTenancy } from "@/components/site/subtenancy";
import { Pricing } from "@/components/site/pricing";
import { Faq } from "@/components/site/faq";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";

// The main site speaks to the WHOLE audience, no-code first (audience doctrine).
// The developer pitch — code hero, API showcase — lives at developers.gateml.io.
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <WhoItsFor />
        <LayerModel />
        <Features />
        <SubTenancy />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
