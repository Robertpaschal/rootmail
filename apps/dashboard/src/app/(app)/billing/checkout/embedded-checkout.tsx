"use client";

import { useMemo } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

/**
 * Mounts Stripe's embedded checkout inline (no redirect). The session client_secret
 * + publishable key come from our API; the card form lives in a Stripe-hosted iframe,
 * so no card data ever touches our code.
 */
export function EmbeddedCheckoutPanel({
  clientSecret,
  publishableKey,
}: {
  clientSecret: string;
  publishableKey: string;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
