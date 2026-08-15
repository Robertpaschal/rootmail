import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { Marquee } from "@/components/site/marquee";
import { ProductShow } from "@/components/site/product-show";
import { WhoItsFor } from "@/components/site/who-its-for";
import { LayerModel } from "@/components/site/layer-model";
import { Features } from "@/components/site/features";
import { SubTenancy } from "@/components/site/subtenancy";
import { Pricing } from "@/components/site/pricing";
import { Faq } from "@/components/site/faq";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";

// The main site sells the PRODUCT to everyone — all your email in one place
// (unification, not "no code"). The developer pitch lives at developers.rootmail.io.
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        {/* Show it before explaining it: the tour sits between "what is this"
            and "who is it for", so nobody has to read twelve feature cards to
            find out what the app looks like. */}
        <ProductShow />
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
