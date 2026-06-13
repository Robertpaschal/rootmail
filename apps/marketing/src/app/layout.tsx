import type { Metadata } from "next";
import "./globals.css";

const description =
  "One email-sending core: dead-simple for a solo developer, with built-in sub-tenancy, full audit trails, and legal-grade proof as you grow. One API. One data model.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rootmail.io"),
  title: {
    default: "rootmail — email infrastructure that scales with who's asking",
    template: "%s · rootmail",
  },
  description,
  applicationName: "rootmail",
  keywords: [
    "email API",
    "transactional email",
    "email infrastructure",
    "sub-tenancy",
    "multi-tenant email",
    "DKIM",
    "audit trail",
    "developer email platform",
  ],
  authors: [{ name: "rootmail" }],
  openGraph: {
    type: "website",
    siteName: "rootmail",
    title: "rootmail — email infrastructure that scales with who's asking",
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
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
