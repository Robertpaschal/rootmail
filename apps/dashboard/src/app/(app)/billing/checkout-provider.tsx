"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { refreshBilling, startEmbeddedCheckout } from "./checkout-actions";
import { Button } from "@/components/ui/button";
import type { CheckoutPayload } from "@/lib/types";

interface CheckoutCtx {
  /** Open the in-app checkout for a wing tier or an add-on set. */
  open: (payload: CheckoutPayload, label?: string) => Promise<void>;
  pending: boolean;
}
const Ctx = createContext<CheckoutCtx | null>(null);

/** useCheckout — trigger the shared in-app checkout modal from any purchase button. */
export function useCheckout(): CheckoutCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCheckout must be used within <CheckoutProvider>");
  return c;
}

// Cache the Stripe.js loader per publishable key (the key is returned by the API).
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(pk: string): Promise<Stripe | null> {
  let p = stripeCache.get(pk);
  if (!p) {
    p = loadStripe(pk);
    stripeCache.set(pk, p);
  }
  return p;
}

type Phase = "idle" | "starting" | "checkout" | "completing" | "done" | "error";

export function CheckoutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [label, setLabel] = useState<string>("your plan");
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  const open = useCallback(
    async (payload: CheckoutPayload, lbl?: string) => {
      setError(null);
      setLabel(lbl ?? "your plan");
      setPhase("starting");
      const res = await startEmbeddedCheckout(payload);
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      if (!res.available) {
        // Applied directly (free/local) — no payment; just refresh.
        setPhase("done");
        router.refresh();
        setTimeout(() => setPhase("idle"), 1200);
        return;
      }
      setStripePromise(stripeFor(res.publishable_key));
      setSecret(res.client_secret);
      setPhase("checkout");
    },
    [router],
  );

  const close = useCallback(() => {
    setPhase("idle");
    setSecret(null);
  }, []);

  // Stripe fires this after the customer completes payment in the embedded form.
  // The webhook applies the change async, so we poll (revalidate + refresh) until
  // the server reflects it — the UI is never left showing stale state.
  const onComplete = useCallback(async () => {
    if (closedRef.current) return;
    setPhase("completing");
    for (let i = 0; i < 6; i++) {
      await refreshBilling();
      router.refresh();
      await new Promise((r) => setTimeout(r, 1500));
    }
    setPhase("done");
    setSecret(null);
    setTimeout(() => setPhase("idle"), 1600);
  }, [router]);

  const modalOpen = phase === "starting" || phase === "checkout" || phase === "completing" || phase === "done" || phase === "error";

  return (
    <Ctx.Provider value={{ open, pending: phase === "starting" }}>
      {children}
      <AnimatePresence>
        {modalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => (phase === "checkout" || phase === "error") && close()}
          >
            <motion.div
              className="relative my-8 w-full max-w-xl rounded-2xl border bg-background shadow-2xl"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {phase === "checkout" || phase === "error" ? (
                <button
                  type="button"
                  onClick={close}
                  className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Close checkout"
                >
                  <X className="size-4" />
                </button>
              ) : null}

              {phase === "starting" ? (
                <div className="grid place-items-center gap-3 p-12 text-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Preparing your checkout…</p>
                </div>
              ) : phase === "error" ? (
                <div className="grid place-items-center gap-3 p-12 text-center">
                  <p className="text-sm font-medium">Couldn&apos;t start checkout</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button size="sm" variant="outline" onClick={close}>
                    Close
                  </Button>
                </div>
              ) : phase === "completing" ? (
                <div className="grid place-items-center gap-3 p-12 text-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm font-medium">Confirming your payment…</p>
                  <p className="text-xs text-muted-foreground">Applying {label} — just a moment.</p>
                </div>
              ) : phase === "done" ? (
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="grid place-items-center gap-3 p-12 text-center"
                >
                  <CheckCircle2 className="size-8 text-emerald-500" />
                  <p className="text-sm font-medium">You&apos;re all set 🎉</p>
                  <p className="text-xs text-muted-foreground">{label} is active.</p>
                </motion.div>
              ) : phase === "checkout" && secret && stripePromise ? (
                <div className="max-h-[80vh] overflow-y-auto p-1">
                  <EmbeddedCheckoutProvider
                    stripe={stripePromise}
                    options={{ clientSecret: secret, onComplete }}
                  >
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
