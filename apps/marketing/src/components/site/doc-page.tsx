import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

/** Shared shell for long-form content pages (legal, docs): navbar, a centered
 * prose column with consistent heading/link styling, and the footer. */
export function DocPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string;
  subtitle?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-3 text-muted-foreground">{subtitle}</p> : null}
        {updated ? <p className="mt-2 text-xs text-muted-foreground">Last updated {updated}</p> : null}
        <div className="mt-10 space-y-5 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
