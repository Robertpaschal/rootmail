import type { Metadata } from "next";
// Self-hosted (src/fonts, SIL OFL 1.1) so builds never fetch from Google.
import localFont from "next/font/local";
import "../fonts/fonts.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

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



export const metadata: Metadata = {
  title: {
    default: "rootmail admin",
    template: "%s · rootmail admin",
  },
  description: "Internal staff console for rootmail.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
