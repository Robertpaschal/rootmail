import type { Metadata } from "next";
import "./globals.css";

const description =
  "The receipts your website sends, the newsletters your audience opens, and the replies they send back — designed, delivered, and understood from one place, instead of juggling a sending service, a newsletter tool, and a personal inbox. If you can write an email, you can run rootmail.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rootmail.io"),
  title: {
    default: "Rootmail — all your email, in one place",
    template: "%s · rootmail",
  },
  description,
  applicationName: "rootmail",
  keywords: [
    "email marketing",
    "newsletter software",
    "transactional email",
    "all-in-one email platform",
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
    title: "Rootmail — all your email, in one place",
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
