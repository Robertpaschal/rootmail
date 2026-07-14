import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPage, sectionOf, siblings } from "@rootmail/docs";
import { PageHeader } from "@/components/app/page-header";
import { DocBlockView } from "../doc-blocks";

export default async function DocPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) notFound();

  const { prev, next } = siblings(slug);
  const section = sectionOf(slug);

  return (
    <>
      <PageHeader
        title={page.title}
        description={page.summary}
        backHref="/docs"
        backLabel={section ? `Docs · ${section.label}` : "Docs"}
        actions={
          <a
            href={`https://developers.gateml.io/docs/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Open on the reference site ↗
          </a>
        }
      />
      <article className="max-w-3xl space-y-4">
        {page.blocks.map((block, i) => (
          <DocBlockView key={i} block={block} />
        ))}

        <div className="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2">
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
    </>
  );
}
