import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

export function Cta() {
  return (
    <section id="cta" className="py-20 md:py-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-16 text-center md:px-16 md:py-20">
          <div
            className="absolute left-1/2 top-0 -z-0 h-[300px] w-[600px] max-w-full -translate-x-1/2 rounded-full bg-primary/30 blur-[120px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Send your first email in minutes
            </h2>
            <p className="text-balance text-lg text-zinc-300">
              Create an account, design your first email in the studio, and send it — all in one
              sitting. Nothing to install, no credit card to start.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href={signupUrl}
                className={cn(buttonVariants({ size: "lg" }), "transition-transform hover:-translate-y-0.5 active:scale-[0.98]")}
              >
                Create your account <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/20 px-6 text-base font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.98]"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              Building a product?{" "}
              <Link
                href="https://developers.gateml.io"
                className="font-medium text-zinc-200 underline-offset-4 hover:underline"
              >
                developers.gateml.io
              </Link>{" "}
              has the technical pitch and docs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
