import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getPublicArticle, staticArticleSlugs, type Block } from "@/lib/blog";
import { Markdown } from "@/components/site/markdown";
import { cn } from "@/lib/utils";
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
      return <h2 className="mt-10 text-xl font-semibold tracking-tight text-foreground">{block.text}</h2>;
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
        <blockquote className="border-l-2 border-primary pl-5 text-base font-medium italic text-foreground">
          {block.text}
        </blockquote>
      );
  }
}

export default async function BlogArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) notFound();

  return (
    <>
      <Navbar />
      <main className="container max-w-3xl py-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All posts
        </Link>

        <div className="mt-8 flex items-center gap-2">
          <Badge>{article.category}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDate(article.date)} · {article.readingMinutes} min read
          </span>
        </div>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-4 text-balance text-lg text-muted-foreground">{article.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">By {article.author}</p>

        <div className="mt-10">
          {article.markdown !== undefined ? (
            <Markdown>{article.markdown}</Markdown>
          ) : (
            <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
              {(article.blocks ?? []).map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-14 rounded-2xl border bg-secondary/30 p-8 text-center">
          <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground">
            Ready to send?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Start free with 3,000 emails a month — no credit card. The dashboard and the API are
            both right there when you sign up.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaButton label="Start sending" arrow />
            <Link href="/blog" className={cn(buttonVariants({ variant: "outline" }))}>
              More from the blog
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
