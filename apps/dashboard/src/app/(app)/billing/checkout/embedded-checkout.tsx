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

  // Stripe's embedded checkout is a light-themed iframe whose appearance is set by
  // Stripe Dashboard branding, not our `dark` class — so we frame it on an explicit
  // white surface. In dark mode it then reads as an intentional payment card rather
  // than a light form clashing with a dark `bg-card`.
  return (
    <div className="overflow-hidden rounded-lg border bg-white p-3 shadow-sm">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
