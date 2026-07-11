import { CheckoutProvider } from "./checkout-provider";
import { BillingLivePoll } from "./live-poll";

// Every billing surface shares the in-app checkout modal (so any purchase button
// can open it) and a live poller (so status is never stale after a checkout).
export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <CheckoutProvider>
      <BillingLivePoll />
      {children}
    </CheckoutProvider>
  );
}
