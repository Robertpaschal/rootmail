import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { LayerModel } from "@/components/site/layer-model";
import { Features } from "@/components/site/features";
import { CodeShowcase } from "@/components/site/code-showcase";
import { SubTenancy } from "@/components/site/subtenancy";
import { Pricing } from "@/components/site/pricing";
import { Faq } from "@/components/site/faq";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <LayerModel />
        <Features />
        <CodeShowcase />
        <SubTenancy />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
