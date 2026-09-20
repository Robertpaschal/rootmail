import type { Metadata } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

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
