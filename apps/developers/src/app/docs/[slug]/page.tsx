import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ALL_PAGES, getPage, sectionOf, siblings, tableOfContents } from "@rootmail/docs";
import { DocBlockView } from "@/components/site/doc-blocks";

/**
 * A DOC PAGE, ON THE SAME SYSTEM AS THE HOMEPAGE.
 *
 * The homepage was rebuilt and the docs were not, so the site disagreed with
 * itself one click in: `text-3xl font-bold tracking-tight` where the rest of
 * the site sets headlines in the display face, `border-border/60` hairlines
 * where the rest uses `--rule`, and prev/next cards at `rounded-xl` with a
 * `hover:border-primary/40` — brass on a card that is not a control, which
 * §10.2 spends a paragraph forbidding. A developer arrives here from the
 * homepage, so this is the seam most likely to be noticed.
 *
 * The footer was also missing entirely (it lives in `layout.tsx` now, outside
 * the sidebar's container): /docs/* was the only surface on the site with no
 * way out at the bottom of a long scroll.
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return ALL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) return {};
  return { title: page.title, description: page.summary };
}

export default async function DocPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) notFound();

  const toc = tableOfContents(page);
  const { prev, next } = siblings(slug);
  const section = sectionOf(slug);

  return (
    <div className="flex gap-10">
        <article className="min-w-0 max-w-2xl flex-1">
          {section ? (
            <p className="font-mono text-[12.5px] uppercase tracking-wider text-ink-muted" data-fact>
              {section.label}
            </p>
          ) : null}
          <h1 className="display-m mt-2 text-balance">{page.title}</h1>
          <p className="lead mt-3 text-ink-muted">{page.summary}</p>

          <div className="mt-8 space-y-4">
            {page.blocks.map((block, i) => (
              <DocBlockView key={i} block={block} />
            ))}
          </div>

          {/* Prev / next. Ruled rows, not cards: two bordered slabs at the foot
              of every page were the heaviest thing on most of them. */}
          <nav className="mt-14 grid gap-px border-t border-rule pt-4 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}`}
                className="group rounded-lg px-3 py-3 transition-colors duration-interaction ease-interaction hover:bg-muted"
              >
                <span className="flex items-center gap-1 font-mono text-[12.5px] text-ink-muted">
                  <ArrowLeft className="size-3" /> previous
                </span>
                <span className="mt-1 block font-medium group-hover:text-brass-text">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                className="group rounded-lg px-3 py-3 text-right transition-colors duration-interaction ease-interaction hover:bg-muted"
              >
                <span className="flex items-center justify-end gap-1 font-mono text-[12.5px] text-ink-muted">
                  next <ArrowRight className="size-3" />
                </span>
                <span className="mt-1 block font-medium group-hover:text-brass-text">
                  {next.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </article>

        {/* On-page table of contents */}
        {toc.length > 1 ? (
          <aside className="sticky top-24 hidden h-fit w-44 shrink-0 xl:block">
            <p className="mb-2 font-mono text-[12.5px] uppercase tracking-wider text-ink-muted">
              on this page
            </p>
            <ul className="space-y-1.5 border-l border-rule">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="-ml-px block border-l border-transparent pl-3 text-sm text-ink-muted transition-colors duration-interaction ease-interaction hover:border-primary hover:text-foreground"
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
    </div>
  );
}
