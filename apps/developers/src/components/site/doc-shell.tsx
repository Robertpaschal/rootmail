import type { ReactNode } from "react";
import { DevFooter, DevNavbar } from "./dev-shell";

/**
 * Long-form doc shell — the legal / policy pages.
 *
 * Same system as everything else now: the display face on the title, `--rule`
 * hairlines, `--ink-muted` body, and links in `brass-text` (the AA-passing cut
 * of brass; the fill value is 3.1:1 on paper). It used to set its own
 * `text-3xl font-bold` and paint links in plain `foreground` with an underline,
 * which made a link indistinguishable from bold text at a glance.
 */
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
        <h1 className="display-m text-balance">{title}</h1>
        {subtitle ? <p className="lead mt-3 text-ink-muted">{subtitle}</p> : null}
        <div className="mt-10 space-y-5 text-sm leading-relaxed text-ink-muted [&_a]:font-medium [&_a]:text-brass-text [&_a]:underline-offset-4 [&_a:hover]:underline [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <DevFooter />
    </>
  );
}
