import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Twitter } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { posts, isArticle, type Post } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Stories from the rootmail team, practical guides to getting the most out of the product, and things we think are worth reading.",
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function meta(post: Post) {
  const reading = isArticle(post) ? ` · ${post.readingMinutes} min read` : "";
  return `${formatDate(post.date)}${reading}`;
}

function PostCard({ post }: { post: Post }) {
  const external = !isArticle(post);
  const href = isArticle(post) ? `/blog/${post.slug}` : post.externalUrl;
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Badge variant={post.category === "Things we like" ? "muted" : "default"}>
          {post.category}
        </Badge>
        <span className="text-xs text-muted-foreground">{meta(post)}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">{post.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
        {external ? (
          <>
            Read on {post.source} <ArrowUpRight className="size-4" />
          </>
        ) : (
          <>
            Read article <ArrowRight className="size-4" />
          </>
        )}
      </span>
    </>
  );

  const className =
    "flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/40";

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export default function BlogPage() {
  const [lead, ...rest] = posts;
  const leadHref = isArticle(lead) ? `/blog/${lead.slug}` : lead.externalUrl;

  return (
    <>
      <Navbar />
      <main className="container py-16 md:py-20">
        <div className="max-w-2xl">
          <Badge className="mb-4">Blog</Badge>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            From the rootmail team
          </h1>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Stories about what we&apos;re building, practical guides for getting the most out of
            rootmail, and a few things we think are worth your time.
          </p>
        </div>

        {/* Lead post */}
        {lead ? (
          <Link
            href={leadHref}
            {...(isArticle(lead) ? {} : { target: "_blank", rel: "noreferrer" })}
            className="mt-12 block rounded-3xl border bg-card p-8 shadow-sm transition-colors hover:border-primary/40 md:p-10"
          >
            <div className="flex items-center gap-2">
              <Badge variant={lead.category === "Things we like" ? "muted" : "default"}>
                {lead.category}
              </Badge>
              <span className="text-xs text-muted-foreground">{meta(lead)}</span>
            </div>
            <h2 className="mt-4 max-w-2xl text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              {lead.title}
            </h2>
            <p className="mt-3 max-w-2xl text-balance text-muted-foreground">{lead.description}</p>
            <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              {isArticle(lead) ? (
                <>
                  Read article <ArrowRight className="size-4" />
                </>
              ) : (
                <>
                  Read on {lead.source} <ArrowUpRight className="size-4" />
                </>
              )}
            </span>
          </Link>
        ) : null}

        {/* Grid */}
        {rest.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : null}

        {/* Social presence */}
        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed bg-card p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Twitter className="size-5" />
            </span>
            <div>
              <p className="font-semibold">Follow along on X</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Product updates, deliverability tips, and the occasional behind-the-scenes — straight
                from the team.
              </p>
            </div>
          </div>
          <a
            href="https://x.com/rootmail"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            @rootmail <ArrowUpRight className="size-4" />
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
