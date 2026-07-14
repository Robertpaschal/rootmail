import type { ReactNode } from "react";
import { DevFooter, DevNavbar } from "./dev-shell";

/** Long-form doc shell: dev navbar, a centered prose column with consistent
 * heading/link/code styling, and the footer. */
export function DocShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <>
      <DevNavbar />
      <main className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-3 text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-10 space-y-5 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <DevFooter />
    </>
  );
}
