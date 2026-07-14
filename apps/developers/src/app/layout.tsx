import type { Metadata } from "next";
import "./globals.css";

const description =
  "Stop rebuilding email inside your product. One integration gives you sending, templates, audiences, webhooks, deliverability, and signed proof — everything the dashboard does, the API does. Change email behavior without redeploying.";

export const metadata: Metadata = {
  metadataBase: new URL("https://developers.gateml.io"),
  title: {
    default: "rootmail for developers — outsource your email layer",
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
    title: "rootmail for developers — outsource your email layer",
    description,
  },
  twitter: { card: "summary_large_image", title: "rootmail for developers", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
