import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { getPublicBlog, isArticle, type Post } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Stories from the rootmail team, practical guides to getting the most out of the product, and things we think are worth reading.",
};

/**
 * `/blog` — four shapes for four different jobs.
 *
 *  G1  bare page ground, type-led, with the shelf counted rather than implied
 *  G2  THE LEAD, as a single full-width figure: hairline above and below, the
 *      title at `display-l`, no card and no border box. One post is being
 *      pointed at, so it gets the whole width and nothing competes with it
 *  G3  THE INDEX, as a ruled table. A blog index is a list of records with
 *      parallel metadata — date, kind, length, destination — which is the
 *      definition of tabular. Cards asserted that twelve posts were twelve
 *      equally-important objects; a table lets the reader scan the column they
 *      care about, which is what anybody actually does on an index
 *  G4  one ruled row for the off-site link, where a dashed callout box was
 *
 * WHAT THIS REPLACES: a `<Badge>` eyebrow, a lead post in a `rounded-3xl`
 * bordered card, a three-across grid of identical bordered cards each with a
 * badge, a date, a title, a 25-word description and a "Read article →" — and a
 * dashed bordered box at the bottom with a tinted icon chip in it.
 */

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const hrefOf = (p: Post) => (isArticle(p) ? `/blog/${p.slug}` : p.externalUrl);
const lengthOf = (p: Post) => (isArticle(p) ? `${p.readingMinutes} min` : `${p.source} ↗`);

export default async function BlogPage() {
  const allPosts = await getPublicBlog();
  const [lead, ...rest] = allPosts;
  const articles = allPosts.filter(isArticle).length;

  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── G1 · bare ground, type-led ─────────────────────────────────── */}
        <section className="container py-14 md:py-20">
          <div className="max-w-3xl">
            <h1 className="display-xl text-balance">From the rootmail team.</h1>
            <p className="mt-6 font-mono text-[12.5px] text-ink-muted" data-fact>
              {allPosts.length} posts · {articles} written here · newest first
            </p>
          </div>
        </section>

        {/* ── G2 · the lead, as one full-width figure ─────────────────────── */}
        {lead ? (
          <section className="slab settle lit lit-edge">
            <div className="container py-14 md:py-20">
              <Link
                href={hrefOf(lead)}
                {...(isArticle(lead) ? {} : { target: "_blank", rel: "noreferrer" })}
                className="group block"
              >
                <p className="border-b border-rule pb-3 font-mono text-[12.5px] uppercase tracking-wide text-ink-muted" data-fact>
                  {lead.category} · {formatDate(lead.date)} · {lengthOf(lead)}
                </p>
                <h2 className="display-l mt-8 max-w-3xl text-balance group-hover:underline group-hover:underline-offset-8">
                  {lead.title}
                </h2>
                {lead.description ? (
                  <p className="lead mt-6 max-w-2xl text-ink-muted">{lead.description}</p>
                ) : null}
                <span className="mt-8 inline-flex items-center gap-1.5 border-t border-rule pt-4 text-sm font-medium">
                  {isArticle(lead) ? (
                    <>
                      Read it <ArrowRight className="size-4" />
                    </>
                  ) : (
                    <>
                      Read on {lead.source} <ArrowUpRight className="size-4" />
                    </>
                  )}
                </span>
              </Link>
            </div>
          </section>
        ) : null}

        {/* ── G3 · the index, as a ruled table ────────────────────────────── */}
        {rest.length > 0 ? (
          <section className="slab settle">
            <div className="container py-12 md:py-16">
              {/* The head row names four columns, and three of them are folded into
                  the row itself below `sm` — so the head row is hidden there
                  rather than left labelling columns that are not on screen. */}
              <div className="hidden border-b border-rule pb-2.5 font-mono text-[12.5px] uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-[6.5rem_1fr_7rem_4.5rem] sm:gap-x-6">
                <span>date</span>
                <span>title</span>
                <span>kind</span>
                <span className="text-right">length</span>
              </div>

              <ul className="ruled border-t border-rule sm:border-t-0">
                {rest.map((post) => {
                  const external = !isArticle(post);
                  const inner = (
                    <span className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[6.5rem_1fr_7rem_4.5rem]">
                      <span className="hidden font-mono text-[12.5px] text-ink-muted sm:block" data-fact>
                        {formatDate(post.date)}
                      </span>
                      <span className="min-w-0">
                        <span className="display-s block text-balance group-hover:underline group-hover:underline-offset-4">
                          {post.title}
                        </span>
                        {post.description ? (
                          <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-muted">
                            {post.description}
                          </span>
                        ) : null}
                        <span className="mt-1 block font-mono text-[12.5px] text-ink-muted sm:hidden" data-fact>
                          {formatDate(post.date)} · {post.category}
                        </span>
                      </span>
                      <span className="hidden font-mono text-[12.5px] text-ink-muted sm:block" data-fact>
                        {post.category}
                      </span>
                      <span className="text-right font-mono text-[12.5px] text-ink-muted" data-fact>
                        {lengthOf(post)}
                      </span>
                    </span>
                  );
                  return (
                    <li key={post.slug}>
                      {external ? (
                        <a
                          href={hrefOf(post)}
                          target="_blank"
                          rel="noreferrer"
                          className="group block"
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link href={hrefOf(post)} className="group block">
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ── G4 · one ruled row ─────────────────────────────────────────── */}
        <section className="container py-12 md:py-16">
          <div className="flex flex-col items-start justify-between gap-3 border-y border-rule py-6 sm:flex-row sm:items-baseline">
            <p className="max-w-xl text-[0.9375rem] text-ink-muted">
              Shorter things — product updates and deliverability notes — go out on X first.
            </p>
            <a
              href="https://x.com/rootmail"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-mono text-[12.5px] text-brass-text underline underline-offset-4"
            >
              @rootmail <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
