import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { getPublicChangelog, type ChangeKind } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What's new in rootmail — new capabilities, improvements, and fixes for senders and developers, dated and categorized.",
};

const KIND_VARIANT: Record<ChangeKind, "default" | "success" | "muted"> = {
  New: "success",
  Improved: "default",
  Fixed: "muted",
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ChangelogPage() {
  const entries = await getPublicChangelog();
  return (
    <>
      <Navbar />
      <main className="container max-w-3xl py-16 md:py-20">
        <div className="max-w-2xl">
          <Badge className="mb-4">Changelog</Badge>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            What&apos;s new in rootmail
          </h1>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Every meaningful improvement to the platform — for the people sending mail and the
            developers building on it. Dated, categorized, and kept current.
          </p>
        </div>

        <div className="mt-14 space-y-12">
          {entries.map((entry, i) => (
            <article
              key={`${entry.date}-${i}`}
              className="grid gap-6 md:grid-cols-[10rem_1fr] md:gap-10"
            >
              <div className="md:pt-1">
                <time
                  dateTime={entry.date}
                  className="text-sm font-medium text-muted-foreground"
                >
                  {formatDate(entry.date)}
                </time>
              </div>

              <div className="relative border-l border-border/60 pl-6 md:border-l-0 md:pl-0">
                <span
                  className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-primary md:hidden"
                  aria-hidden="true"
                />
                <h2 className="text-xl font-semibold tracking-tight">{entry.title}</h2>
                <ul className="mt-4 space-y-3">
                  {entry.changes.map((c, i) => (
                    <li key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                      <Badge variant={KIND_VARIANT[c.kind]} className="shrink-0 sm:mt-0.5">
                        {c.kind}
                      </Badge>
                      <span className="text-sm leading-relaxed text-muted-foreground">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
