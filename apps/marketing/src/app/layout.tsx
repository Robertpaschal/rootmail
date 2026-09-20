import { BetaNotice } from "@/components/site/beta-notice";
import type { Metadata } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// §12: Manrope carries UI and console figures; Fraunces keeps the public
// narrative voice. JetBrains Mono marks ids, timestamps and recorded values.
// See docs/design/00-PHILOSOPHY.md for the owner-approved type roles.
const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});
const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});



// Both readers, in the order the page argues them. A search result is the first
// impression for someone who just wants their own email handled AND for a
// platform sending on behalf of others; a description that only speaks to the
// second loses the first before they ever arrive.
const description =
  "Order confirmations, password resets, newsletters, and the replies people send back — one system, one contact list, one address of your own. If you send for your own customers, each of them gets their own sending domain, their own suppression list and their own score, and we throttle the one going wrong before it costs the others. Keep the provider you already use, or let us deliver it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rootmail.io"),
  title: {
    default: "rootmail — send your business's email, and know what happened to every one",
    template: "%s · rootmail",
  },
  description,
  applicationName: "rootmail",
  keywords: [
    "multi-tenant email",
    "email for SaaS platforms",
    "send email on behalf of customers",
    "per-tenant email reputation",
    "sub-tenant email API",
    "transactional email",
    "email deliverability",
    "email API",
    "newsletter software",
  ],
  authors: [{ name: "rootmail" }],
  openGraph: {
    type: "website",
    siteName: "rootmail",
    title: "rootmail — send your business's email, and know what happened to every one",
    description,
    url: "https://rootmail.io",
  },
  twitter: {
    card: "summary_large_image",
    title: "rootmail",
    description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      {/* NO `bg-background` HERE, deliberately — it is what broke the slab
          system without anybody noticing. `globals.css` sets the page ground to
          `--paper-lift` in `@layer base`, and a Tailwind UTILITY on this
          element beats a base-layer rule, so the ground silently resolved to
          `--paper` instead. Measured before the fix: body rgb(249,246,241) —
          `--paper` at 96% — under slabs painted `--paper-raised` at 99%. A
          three-point step where the design calls for six, which is a
          meaningful part of "there is no depth or layer to it". The base rule
          also carries `text-foreground`, so nothing else is lost by dropping
          the class. */}
      <body className="min-h-screen font-sans antialiased">
        <a className="skip-link" href="#main-content">Skip to content</a>
        {/* Above everything, on every page: a visitor must never reach a Sign
            up button without knowing the door is locked.

            Suspended so the live seat count can be fetched per-request without
            dragging the entire marketing site into dynamic rendering. The
            fallback is deliberately the safe, true message rather than a
            skeleton — a visitor who sees only this still learns the useful
            thing, and it never flashes a number that might be wrong. */}
        <BetaNotice />
        {children}
      </body>
    </html>
  );
}
