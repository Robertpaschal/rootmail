import { BetaNotice } from "@/components/site/beta-notice";
import type { Metadata } from "next";
// Self-hosted (src/fonts, SIL OFL 1.1) so builds never fetch from Google.
import localFont from "next/font/local";
import "../fonts/fonts.css";
import "./globals.css";

// §12: Manrope carries UI and console figures; Fraunces keeps the public
// narrative voice. JetBrains Mono marks ids, timestamps and recorded values.
// See docs/design/00-PHILOSOPHY.md for the owner-approved type roles.
// Self-hosted copies of the Google Fonts files (see src/fonts/README.md).
// next/font/local loads and preloads the latin subset; ../fonts/fonts.css adds
// the other subsets and the metric-adjusted fallbacks named in `fallback`.
// next/font needs literal options, so the latin unicode-range is repeated.
const display = localFont({
  src: "../fonts/Fraunces-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["rootmail Fraunces Subsets", "rootmail Fraunces Fallback"],
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const sans = localFont({
  src: "../fonts/Manrope-latin.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-manrope",
  display: "swap",
  fallback: ["rootmail Manrope Subsets", "rootmail Manrope Fallback"],
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const mono = localFont({
  src: [
    { path: "../fonts/JetBrainsMono-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/JetBrainsMono-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["rootmail JetBrains Mono Subsets", "rootmail JetBrains Mono Fallback"],
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
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
