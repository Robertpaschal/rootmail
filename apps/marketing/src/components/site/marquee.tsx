import {
  BadgeCheck,
  Bell,
  CalendarClock,
  FileText,
  Gift,
  KeyRound,
  Mail,
  Megaphone,
  Newspaper,
  Package,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

// The breadth of the product, said by showing it rather than listing it — and
// the one thing on the page that moves without being asked to. Every item is a
// kind of email rootmail actually sends; no logos, no borrowed credibility.
const kinds = [
  { icon: Receipt, label: "Order confirmations" },
  { icon: KeyRound, label: "Password resets" },
  { icon: Gift, label: "Welcome series" },
  { icon: Newspaper, label: "Monthly newsletters" },
  { icon: Package, label: "Shipping updates" },
  { icon: BadgeCheck, label: "Verification codes" },
  { icon: Megaphone, label: "Launch announcements" },
  { icon: ShoppingCart, label: "Abandoned carts" },
  { icon: FileText, label: "Invoices" },
  { icon: CalendarClock, label: "Event reminders" },
  { icon: RotateCcw, label: "Win-backs" },
  { icon: Bell, label: "Alerts" },
  { icon: Sparkles, label: "Product digests" },
  { icon: Mail, label: "Plain old email" },
];

export function Marquee() {
  return (
    <section
      className="relative overflow-hidden border-y border-border/60 bg-secondary/20 py-4"
      aria-label="Kinds of email rootmail sends"
    >
      {/* Edges fade rather than cut, so items enter and leave rather than pop. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-32"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-32"
        aria-hidden="true"
      />

      {/* The track is duplicated and travels exactly -50%, so the second copy
          lands where the first began and the seam never shows.
          `motion-reduce:animate-none` leaves a legible static strip for anyone
          who has asked the OS for less movement. */}
      <div className="flex w-max animate-marquee items-center gap-3 motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-3" aria-hidden={copy === 1}>
            {kinds.map((k) => (
              <span
                key={k.label}
                className="flex shrink-0 items-center gap-2 rounded-full border bg-card/70 px-3.5 py-1.5 text-sm text-muted-foreground"
              >
                <k.icon className="size-3.5 text-primary" />
                {k.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
