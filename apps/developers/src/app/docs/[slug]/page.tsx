import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ALL_PAGES, getPage, sectionOf, siblings, tableOfContents } from "@rootmail/docs";
import { DocBlockView } from "@/components/site/doc-blocks";

export const dynamicParams = false;
export function generateStaticParams() {
  return ALL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
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
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{section.label}</p>
        ) : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{page.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{page.summary}</p>

        <div className="mt-8 space-y-4">
          {page.blocks.map((block, i) => (
            <DocBlockView key={i} block={block} />
          ))}
        </div>

        {/* Prev / next */}
        <div className="mt-14 grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="group rounded-xl border p-4 transition-colors hover:border-primary/40">
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="size-3" /> Previous</span>
              <span className="mt-1 block font-medium group-hover:text-primary">{prev.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link href={`/docs/${next.slug}`} className="group rounded-xl border p-4 text-right transition-colors hover:border-primary/40">
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">Next <ArrowRight className="size-3" /></span>
              <span className="mt-1 block font-medium group-hover:text-primary">{next.title}</span>
            </Link>
          ) : <span />}
        </div>
      </article>

      {/* On-page table of contents */}
      {toc.length > 1 ? (
        <aside className="sticky top-24 hidden h-fit w-44 shrink-0 xl:block">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">On this page</p>
          <ul className="space-y-1.5 border-l">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="-ml-px block border-l border-transparent pl-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
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
