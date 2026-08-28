import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

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
