import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { getPublicArticle, staticArticleSlugs, type Block } from "@/lib/blog";
import { Markdown } from "@/components/site/markdown";
import { CtaButton } from "@/components/site/cta-button";

type Params = { slug: string };

// Static (baseline) slugs are prerendered; admin-published slugs render on-demand.
export const dynamicParams = true;

export function generateStaticParams(): Params[] {
  return staticArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) return { title: "Not found" };
  return { title: article.title, description: article.description };
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "h2":
      return <h2 className="display-s mt-10 text-foreground">{block.text}</h2>;
    case "p":
      return <p>{block.text}</p>;
    case "ul":
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="ml-4 list-disc">
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-brass pl-5 text-base font-medium italic text-foreground">
          {block.text}
        </blockquote>
      );
  }
}

/**
 * `/blog/<slug>` — three shapes.
 *
 *  R1  the masthead, on the bare page ground: a mono sourcing line ABOVE the
 *      title, then the title at `display-xl`. Putting the date, the length and
 *      the author first is the same move the product makes everywhere else —
 *      say where a thing came from before you say what it claims
 *  R2  the reading column, on a slab. An article is prose and prose wants one
 *      column; this is the one page on the site where a wall of text is the
 *      correct shape, so it gets a real reading measure and body-size ink
 *      instead of the 14px muted grey it had
 *  R3  the close, as a single ruled band on the bare ground — not the centred
 *      bordered box that every other page on the site was also ending with
 */
export default async function BlogArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) notFound();

  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── R1 · masthead on the bare ground ───────────────────────────── */}
        <section className="container max-w-3xl py-12 md:py-16">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted transition-colors duration-interaction ease-interaction hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> all posts
          </Link>

          <p className="mt-8 border-y border-rule py-2.5 font-mono text-[11px] uppercase tracking-wide text-ink-muted" data-fact>
            {article.category} · {formatDate(article.date)} · {article.readingMinutes} min ·{" "}
            {article.author}
          </p>
          <h1 className="display-xl mt-8 text-balance">{article.title}</h1>
          <p className="lead mt-6 text-ink-muted">{article.description}</p>
        </section>

        {/* ── R2 · the reading column ────────────────────────────────────── */}
        <section className="slab settle">
          <div className="container max-w-3xl py-12 md:py-16">
            {article.markdown !== undefined ? (
              <Markdown>{article.markdown}</Markdown>
            ) : (
              <div className="space-y-5 text-base leading-relaxed text-ink-muted">
                {(article.blocks ?? []).map((block, i) => (
                  <BlockView key={i} block={block} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── R3 · the close, one ruled band ─────────────────────────────── */}
        <section className="container max-w-3xl py-12 md:py-16">
          <div className="flex flex-col items-start justify-between gap-5 border-y border-rule py-7 sm:flex-row sm:items-center">
            <div>
              <p className="display-s">Send one and watch the line.</p>
              <p className="mt-1.5 font-mono text-[11px] text-ink-muted" data-fact>
                free tier · no card · dashboard and API together
              </p>
            </div>
            <CtaButton label="Start sending" className="shrink-0" arrow />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
