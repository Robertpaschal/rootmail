import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BetaNotice } from "@/components/site/beta-notice";

// Three roles, not two. Fraunces carries headlines AND figures — the big
// numbers on a page belong in the display face at size, which is what makes
// them legible; squeezing them into a mono made the most important numbers on
// the screen the hardest to read. Mono keeps ids, timestamps and sourcing
// lines. See docs/design/00-PHILOSOPHY.md §9.
const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});



const description =
  "Stop rebuilding email inside your product. One integration gives you sending, templates, audiences, webhooks, deliverability, and signed proof — everything the dashboard does, the API does. Change email behavior without redeploying.";

export const metadata: Metadata = {
  metadataBase: new URL("https://developers.rootmail.io"),
  title: {
    default: "Rootmail for developers — outsource your email layer",
    template: "%s · rootmail developers",
  },
  description,
  applicationName: "rootmail developers",
  keywords: [
    "email API",
    "transactional email API",
    "email SDK",
    "node email library",
    "email webhooks",
    "idempotent email",
    "email infrastructure",
    "sendgrid alternative",
    "postmark alternative",
  ],
  authors: [{ name: "rootmail" }],
  openGraph: {
    type: "website",
    siteName: "rootmail developers",
    title: "Rootmail for developers — outsource your email layer",
    description,
  },
  twitter: { card: "summary_large_image", title: "rootmail for developers", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Same convention as the main site (dark class + localStorage), but a
            developer surface DEFAULTS to dark when nothing is saved. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}",
          }}
        />
      </head>
      {/* No `bg-background` here. It is a Tailwind UTILITY, and the utilities layer
          beats the `@layer base` rule in globals.css that sets the page ground to
          `--paper-lift` — so the ground silently resolved to `--paper` and the
          slabs sat on a 3-point step in the opposite direction from the design.
          The comment in globals.css describing "the deeper ground the slabs sit
          on" was documenting something that had never happened. Matches the fix
          on the marketing site. */}
      <body className="min-h-screen font-sans antialiased">
        <BetaNotice />
        {children}
      </body>
    </html>
  );
}
