import { BetaNotice } from "@/components/site/beta-notice";
import type { Metadata } from "next";
import "./globals.css";

// Matches what the page now argues. Search results and link previews are the
// first impression a platform buyer gets, and "all your email in one place" reads
// as a consolidation tool to replace their provider rather than a layer above it.
const description =
  "Send email for your customers without inheriting their mistakes. Every client gets their own sending domain, signing keys, suppression list and reputation score — measured separately and enforced automatically. Keep the provider you already use, or let us deliver it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rootmail.io"),
  title: {
    default: "Rootmail — email infrastructure for platforms that send for their customers",
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
    title: "Rootmail — email infrastructure for platforms that send for their customers",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
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
