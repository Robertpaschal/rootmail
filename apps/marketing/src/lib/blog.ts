// The blog. Three kinds of entries live here:
//   1. Full articles (company stories + practical how-to / help guides) — give
//      them a `body` of typed blocks and they render at /blog/<slug>.
//   2. Curated "things we like" — set `externalUrl` instead of `body`; the card
//      links straight out (no detail page).
// To add a post, prepend to `posts` (newest first). Keep slugs URL-safe + unique.

export type PostCategory = "Company" | "Guide" | "Things we like";

/** A single block of article content. Keep it small + typed (no MDX dep). */
export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "quote"; text: string };

interface BasePost {
  slug: string;
  title: string;
  description: string;
  /** ISO date, e.g. "2026-06-22". */
  date: string;
  author: string;
  category: PostCategory;
}

/** A full article rendered on its own page. */
export interface ArticlePost extends BasePost {
  readingMinutes: number;
  body: Block[];
  externalUrl?: never;
}

/** A curated link — the card points off-site, no detail page. */
export interface LinkPost extends BasePost {
  externalUrl: string;
  source: string;
  body?: never;
}

export type Post = ArticlePost | LinkPost;

export function isArticle(post: Post): post is ArticlePost {
  return "body" in post && Array.isArray(post.body);
}

export const posts: Post[] = [
  {
    slug: "why-we-built-rootmail",
    title: "Why we built rootmail",
    description:
      "Email turns into a stack of three vendors the moment you grow. We thought it should be one thing — for marketers and engineers alike.",
    date: "2026-06-22",
    author: "The rootmail team",
    category: "Company",
    readingMinutes: 4,
    body: [
      {
        type: "p",
        text: "Every company sends email, and almost every company ends up with the same mess. You start with one service for receipts and password resets. Then marketing wants newsletters, so a second tool shows up. Sales wants sequences, so does a third. None of them share a contact list, a sender reputation, or a history — and the day you want to switch, you re-import everything and start your deliverability over from zero.",
      },
      {
        type: "p",
        text: "We kept hitting that wall, and we noticed something: the underlying job is the same every time. Take a message, render it, authenticate it, deliver it, track what happened, and don't email people who asked you to stop. The differences between “transactional,” “marketing,” and “sales” are mostly product packaging on top of one identical pipeline.",
      },
      {
        type: "h2",
        text: "One data model, all the way up",
      },
      {
        type: "p",
        text: "So we built rootmail around a single core. The same model that sends one welcome email scales up to give every one of your customers their own verified sending domain, and up again to produce cryptographically signed proof of a message's entire lifecycle. You don't migrate between products as you grow — you switch on the next layer.",
      },
      {
        type: "ul",
        items: [
          "Send transactional, marketing, and sales mail from one place.",
          "Give each of your own customers an isolated sending domain when you need it.",
          "Prove exactly what you sent, signed and timestamped, when compliance asks.",
        ],
      },
      {
        type: "h2",
        text: "For everyone who sends",
      },
      {
        type: "p",
        text: "The other thing we refused to accept was the split between “tools for marketers” and “APIs for developers.” A founder should be able to point and click their way to a campaign; an engineer should be able to do the identical thing with a typed SDK. rootmail is one product with two front doors — a no-code dashboard and a clean API — over the same data.",
      },
      {
        type: "quote",
        text: "Getting into the inbox and being able to prove what you sent shouldn't be add-ons. They should be the product.",
      },
      {
        type: "p",
        text: "That's the bet. If it resonates, start free and send your first email today — or tell us what you're building. We read every note.",
      },
    ],
  },
  {
    slug: "land-in-the-inbox-not-spam",
    title: "Land in the inbox, not spam: a practical checklist",
    description:
      "A plain-English guide to the handful of things that actually decide whether your email gets delivered — no jargon required.",
    date: "2026-06-15",
    author: "The rootmail team",
    category: "Guide",
    readingMinutes: 6,
    body: [
      {
        type: "p",
        text: "Deliverability sounds like a dark art, but most of it comes down to a short list of fundamentals. Get these right and you'll reach the inbox far more often. rootmail handles or guides you through every one of them — here's what's actually going on.",
      },
      {
        type: "h2",
        text: "1. Authenticate your domain",
      },
      {
        type: "p",
        text: "Mailbox providers want proof that your mail really comes from you. That's what SPF, DKIM, and DMARC do. In rootmail you add a few DNS records we generate, paste them into your domain provider, and we verify them for you — then show you whether each one is set up correctly and how to strengthen a weak policy.",
      },
      {
        type: "h2",
        text: "2. Only email people who want it",
      },
      {
        type: "p",
        text: "Nothing sinks a sender reputation faster than emailing addresses that bounce or mark you as spam. rootmail automatically maintains a suppression list — anyone who bounces, complains, or unsubscribes is skipped on every future send, so you don't have to police it by hand.",
      },
      {
        type: "h2",
        text: "3. Warm up and stay consistent",
      },
      {
        type: "ul",
        items: [
          "Start with your most engaged contacts and grow volume gradually rather than blasting a cold list on day one.",
          "Send on a steady cadence — sudden spikes look suspicious to mailbox providers.",
          "Make unsubscribing easy; a clear opt-out beats a spam complaint every time.",
        ],
      },
      {
        type: "h2",
        text: "4. Watch your score and fix what it flags",
      },
      {
        type: "p",
        text: "rootmail gives you a 0–100 deliverability score from your real sending outcomes, plus the specific factors pulling it down and what to do about them. Treat a dip like a check-engine light: open it up, read the recommendation, and act before it becomes a deliverability problem.",
      },
      {
        type: "quote",
        text: "Deliverability isn't luck. It's a checklist — and the tool should walk you through it.",
      },
    ],
  },
  {
    slug: "no-code-first-campaign",
    title: "Send your first campaign without writing any code",
    description:
      "From a list of contacts to a sent campaign in the dashboard — a step-by-step walkthrough for non-technical teams.",
    date: "2026-06-08",
    author: "The rootmail team",
    category: "Guide",
    readingMinutes: 5,
    body: [
      {
        type: "p",
        text: "You don't need a developer to send a great email with rootmail. Here's the whole flow, start to finish, entirely in the dashboard.",
      },
      {
        type: "h2",
        text: "Step 1 — Bring in your contacts",
      },
      {
        type: "p",
        text: "Import a CSV of your contacts, or bring them straight over from SendGrid, Postmark, or Mailgun. Your unsubscribe history comes with them, so you won't accidentally email anyone who opted out.",
      },
      {
        type: "h2",
        text: "Step 2 — Design your email",
      },
      {
        type: "p",
        text: "Use the visual template editor to write and style your message, with a live preview as you go. Stuck on wording? Ask the built-in assistant to draft it for you, then edit to taste.",
      },
      {
        type: "h2",
        text: "Step 3 — Pick who gets it",
      },
      {
        type: "p",
        text: "Group your contacts into a list — everyone, or a segment like “new this month.” Lists are reusable, so next time you can send to the same audience in a click.",
      },
      {
        type: "h2",
        text: "Step 4 — Send, then learn",
      },
      {
        type: "ul",
        items: [
          "Send the campaign now, or schedule it for later.",
          "Watch delivered, opened, and clicked rates roll in on the analytics page.",
          "Turn your best one-off into an automated sequence so new contacts get it on their own.",
        ],
      },
      {
        type: "p",
        text: "That's it — no code, no second tool, no spreadsheet of bounces. When you're ready to automate further or hand it to your engineers, the exact same campaign is available over the API.",
      },
    ],
  },
  {
    slug: "rfc-5322-internet-message-format",
    title: "RFC 5322: the Internet Message Format",
    description:
      "The spec that defines what an email actually is. A worthwhile read if you want to understand headers, addressing, and threading from the ground up.",
    date: "2026-06-01",
    author: "The rootmail team",
    category: "Things we like",
    externalUrl: "https://www.rfc-editor.org/rfc/rfc5322",
    source: "rfc-editor.org",
  },
];

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

interface ApiPost {
  slug: string;
  title: string;
  description: string;
  category: PostCategory;
  author: string;
  date: string;
  reading_minutes: number;
  body: string; // Markdown
}

/** A post resolved for the article page: DB posts carry markdown, static ones blocks. */
export interface ResolvedArticle {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: PostCategory;
  readingMinutes: number;
  markdown?: string;
  blocks?: Block[];
}

// In the LIST a DB post is an article whose body isn't rendered there.
function dbToListPost(p: ApiPost): ArticlePost {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date.slice(0, 10),
    author: p.author,
    category: p.category,
    readingMinutes: p.reading_minutes,
    body: [],
  };
}

/**
 * Posts for the /blog index: admin-managed posts (API) merged with the static
 * baseline, newest first (a DB post wins on a slug clash). On-demand ISR via the
 * `blog` tag; static-only fallback when the API is unreachable.
 */
export async function getPublicBlog(): Promise<Post[]> {
  let live: Post[] = [];
  try {
    const res = await fetch(new URL("/v1/blog", API_URL), { next: { revalidate: 3600, tags: ["blog"] } });
    if (res.ok) {
      const json = (await res.json()) as { data?: ApiPost[] };
      live = (json.data ?? []).map(dbToListPost);
    }
  } catch {
    // API unreachable → static baseline only.
  }
  const bySlug = new Map<string, Post>();
  for (const p of [...live, ...posts]) if (!bySlug.has(p.slug)) bySlug.set(p.slug, p);
  return [...bySlug.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Resolve a single article — API first (markdown), else the static baseline (blocks). */
export async function getPublicArticle(slug: string): Promise<ResolvedArticle | null> {
  try {
    const res = await fetch(new URL(`/v1/blog/${encodeURIComponent(slug)}`, API_URL), {
      next: { revalidate: 3600, tags: ["blog"] },
    });
    if (res.ok) {
      const p = (await res.json()) as ApiPost;
      return {
        slug: p.slug,
        title: p.title,
        description: p.description,
        date: p.date.slice(0, 10),
        author: p.author,
        category: p.category,
        readingMinutes: p.reading_minutes,
        markdown: p.body,
      };
    }
  } catch {
    // fall through to the static baseline
  }
  const post = posts.find((p) => p.slug === slug);
  if (post && isArticle(post)) {
    return {
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      author: post.author,
      category: post.category,
      readingMinutes: post.readingMinutes,
      blocks: post.body,
    };
  }
  return null;
}

/** Static article slugs for SSG; DB slugs render on-demand (dynamicParams). */
export function staticArticleSlugs(): string[] {
  return posts.filter(isArticle).map((p) => p.slug);
}
