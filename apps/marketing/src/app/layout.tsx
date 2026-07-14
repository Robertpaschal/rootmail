import type { Metadata } from "next";
import "./globals.css";

const description =
  "The receipts your website sends, the newsletters your audience reads, and the replies they send back — designed, sent, and understood from one dashboard anyone can use. No code required; a full API when you want one.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rootmail.io"),
  title: {
    default: "rootmail — all your email. No code required.",
    template: "%s · rootmail",
  },
  description,
  applicationName: "rootmail",
  keywords: [
    "email marketing",
    "newsletter software",
    "transactional email",
    "no-code email",
    "email campaigns",
    "email templates",
    "shared inbox",
    "email deliverability",
    "email API",
  ],
  authors: [{ name: "rootmail" }],
  openGraph: {
    type: "website",
    siteName: "rootmail",
    title: "rootmail — all your email. No code required.",
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
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
