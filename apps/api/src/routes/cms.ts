import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CHANGE_KINDS,
  CMS_STATUSES,
  env,
  Errors,
  newId,
  POST_CATEGORIES,
} from "@rootmail/core";
import { type BlogPost, blogPosts, type ChangelogEntry, changelogEntries, db } from "@rootmail/db";
import { requireStaff, requireStaffPermission, writeStaffAudit } from "../lib/admin-auth";
import { parse } from "../lib/validate";

// --- Serializers (snake_case JSON, the marketing site's contract) ---------
const WORDS_PER_MINUTE = 200;
function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function serializeBlogPost(p: BlogPost, opts: { admin?: boolean } = {}) {
  return {
    object: "blog_post" as const,
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    author: p.author,
    body: p.body,
    cover_image_url: p.coverImageUrl,
    external_url: p.externalUrl,
    source: p.source,
    reading_minutes: readingMinutes(p.body),
    // The displayed date — when it went live (falls back to creation for drafts).
    date: (p.publishedAt ?? p.createdAt).toISOString(),
    status: p.status,
    published_at: p.publishedAt ? p.publishedAt.toISOString() : null,
    ...(opts.admin
      ? { created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString() }
      : {}),
  };
}

function serializeChangelogEntry(e: ChangelogEntry, opts: { admin?: boolean } = {}) {
  return {
    object: "changelog_entry" as const,
    id: e.id,
    title: e.title,
    date: e.entryDate.toISOString(),
    changes: e.changes,
    status: e.status,
    published_at: e.publishedAt ? e.publishedAt.toISOString() : null,
    ...(opts.admin
      ? { created_at: e.createdAt.toISOString(), updated_at: e.updatedAt.toISOString() }
      : {}),
  };
}

// --- On-publish revalidation ---------------------------------------------
// Tell the marketing site to rebuild the affected pages NOW (on-demand ISR), so
// it never has to poll. Best-effort + fire-and-forget: a content edit must never
// fail just because the marketing host is briefly unreachable. The marketing
// /api/revalidate route checks the same INTERNAL_API_SECRET.
function triggerRevalidate(tags: string[]): void {
  const secret = env.INTERNAL_API_SECRET;
  if (!secret) return; // no shared secret → fall back to the long ISR backstop
  for (const tag of tags) {
    void fetch(new URL(`/api/revalidate?tag=${encodeURIComponent(tag)}`, env.MARKETING_URL), {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
    }).catch(() => undefined);
  }
}

// --- Validation -----------------------------------------------------------
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const changeItem = z.object({
  kind: z.enum(CHANGE_KINDS),
  text: z.string().trim().min(1).max(400),
});

const blogCreate = z.object({
  slug: z.string().trim().min(1).max(120).regex(slugRe, "Use a URL-safe slug (lowercase, hyphens)."),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(400).default(""),
  category: z.enum(POST_CATEGORIES).default("Company"),
  author: z.string().trim().min(1).max(120).default("rootmail"),
  body: z.string().max(100_000).default(""),
  cover_image_url: z.string().url().max(500).nullish(),
  external_url: z.string().url().max(500).nullish(),
  source: z.string().trim().max(120).nullish(),
  status: z.enum(CMS_STATUSES).default("draft"),
});
const blogUpdate = z.object({
  slug: z.string().trim().min(1).max(120).regex(slugRe, "Use a URL-safe slug (lowercase, hyphens).").optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(400).optional(),
  category: z.enum(POST_CATEGORIES).optional(),
  author: z.string().trim().min(1).max(120).optional(),
  body: z.string().max(100_000).optional(),
  cover_image_url: z.string().url().max(500).nullish(),
  external_url: z.string().url().max(500).nullish(),
  source: z.string().trim().max(120).nullish(),
  status: z.enum(CMS_STATUSES).optional(),
});

const changelogCreate = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.coerce.date().optional(),
  changes: z.array(changeItem).min(1).max(20),
  status: z.enum(CMS_STATUSES).default("draft"),
});
const changelogUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  date: z.coerce.date().optional(),
  changes: z.array(changeItem).min(1).max(20).optional(),
  status: z.enum(CMS_STATUSES).optional(),
});

export async function cmsRoutes(app: FastifyInstance): Promise<void> {
  // ===================== PUBLIC (the marketing site reads these) ==========
  app.get("/v1/blog", async () => {
    const rows = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt));
    return { object: "list", data: rows.map((p) => serializeBlogPost(p)) };
  });

  app.get("/v1/blog/:slug", async (req) => {
    const { slug } = req.params as { slug: string };
    const [post] = await db
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
      .limit(1);
    if (!post) throw Errors.notFound("Post not found");
    return serializeBlogPost(post);
  });

  app.get("/v1/changelog", async () => {
    const rows = await db
      .select()
      .from(changelogEntries)
      .where(eq(changelogEntries.status, "published"))
      .orderBy(desc(changelogEntries.entryDate));
    return { object: "list", data: rows.map((e) => serializeChangelogEntry(e)) };
  });

  // ===================== ADMIN (staff: content.publish) ==================
  // ----- Blog -----
  app.get("/v1/admin/cms/blog", async (req) => {
    requireStaffPermission(await requireStaff(req), "content.publish");
    const rows = await db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
    return { object: "list", data: rows.map((p) => serializeBlogPost(p, { admin: true })) };
  });

  app.post("/v1/admin/cms/blog", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const body = parse(blogCreate, req.body);
    const [dupe] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, body.slug))
      .limit(1);
    if (dupe) throw Errors.conflict("A post with that slug already exists.");
    const [post] = await db
      .insert(blogPosts)
      .values({
        id: newId("blogPost"),
        slug: body.slug,
        title: body.title,
        description: body.description,
        category: body.category,
        author: body.author,
        body: body.body,
        coverImageUrl: body.cover_image_url ?? null,
        externalUrl: body.external_url ?? null,
        source: body.source ?? null,
        status: body.status,
        publishedAt: body.status === "published" ? new Date() : null,
        createdBy: actor.id,
      })
      .returning();
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.blog.create",
      targetType: "blog_post",
      targetId: post.id,
      metadata: { slug: post.slug, status: post.status },
      ip: req.ip,
    });
    if (post.status === "published") triggerRevalidate(["blog"]);
    return serializeBlogPost(post, { admin: true });
  });

  app.patch("/v1/admin/cms/blog/:id", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const { id } = req.params as { id: string };
    const body = parse(blogUpdate, req.body);
    const [current] = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!current) throw Errors.notFound("Post not found");
    if (body.slug && body.slug !== current.slug) {
      const [dupe] = await db
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(eq(blogPosts.slug, body.slug))
        .limit(1);
      if (dupe) throw Errors.conflict("A post with that slug already exists.");
    }
    const nextStatus = body.status ?? current.status;
    // published_at: stamped on the first publish, cleared when unpublished.
    const publishedAt = nextStatus === "published" ? (current.publishedAt ?? new Date()) : null;
    const [post] = await db
      .update(blogPosts)
      .set({
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.author !== undefined ? { author: body.author } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.cover_image_url !== undefined ? { coverImageUrl: body.cover_image_url ?? null } : {}),
        ...(body.external_url !== undefined ? { externalUrl: body.external_url ?? null } : {}),
        ...(body.source !== undefined ? { source: body.source ?? null } : {}),
        status: nextStatus,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.blog.update",
      targetType: "blog_post",
      targetId: id,
      metadata: { slug: post.slug, status: post.status },
      ip: req.ip,
    });
    triggerRevalidate(["blog"]); // (un)publish or a slug change both affect the site
    return serializeBlogPost(post, { admin: true });
  });

  app.delete("/v1/admin/cms/blog/:id", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const { id } = req.params as { id: string };
    const [post] = await db.delete(blogPosts).where(eq(blogPosts.id, id)).returning();
    if (!post) throw Errors.notFound("Post not found");
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.blog.delete",
      targetType: "blog_post",
      targetId: id,
      metadata: { slug: post.slug },
      ip: req.ip,
    });
    triggerRevalidate(["blog"]);
    return { object: "blog_post", id, deleted: true };
  });

  // ----- Changelog -----
  app.get("/v1/admin/cms/changelog", async (req) => {
    requireStaffPermission(await requireStaff(req), "content.publish");
    const rows = await db.select().from(changelogEntries).orderBy(desc(changelogEntries.entryDate));
    return { object: "list", data: rows.map((e) => serializeChangelogEntry(e, { admin: true })) };
  });

  app.post("/v1/admin/cms/changelog", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const body = parse(changelogCreate, req.body);
    const [entry] = await db
      .insert(changelogEntries)
      .values({
        id: newId("changelogEntry"),
        title: body.title,
        entryDate: body.date ?? new Date(),
        changes: body.changes,
        status: body.status,
        publishedAt: body.status === "published" ? new Date() : null,
        createdBy: actor.id,
      })
      .returning();
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.changelog.create",
      targetType: "changelog_entry",
      targetId: entry.id,
      metadata: { title: entry.title, status: entry.status },
      ip: req.ip,
    });
    if (entry.status === "published") triggerRevalidate(["changelog"]);
    return serializeChangelogEntry(entry, { admin: true });
  });

  app.patch("/v1/admin/cms/changelog/:id", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const { id } = req.params as { id: string };
    const body = parse(changelogUpdate, req.body);
    const [current] = await db
      .select()
      .from(changelogEntries)
      .where(eq(changelogEntries.id, id))
      .limit(1);
    if (!current) throw Errors.notFound("Entry not found");
    const nextStatus = body.status ?? current.status;
    const publishedAt = nextStatus === "published" ? (current.publishedAt ?? new Date()) : null;
    const [entry] = await db
      .update(changelogEntries)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.date !== undefined ? { entryDate: body.date } : {}),
        ...(body.changes !== undefined ? { changes: body.changes } : {}),
        status: nextStatus,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(changelogEntries.id, id))
      .returning();
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.changelog.update",
      targetType: "changelog_entry",
      targetId: id,
      metadata: { title: entry.title, status: entry.status },
      ip: req.ip,
    });
    triggerRevalidate(["changelog"]);
    return serializeChangelogEntry(entry, { admin: true });
  });

  app.delete("/v1/admin/cms/changelog/:id", async (req) => {
    const actor = await requireStaff(req);
    requireStaffPermission(actor, "content.publish");
    const { id } = req.params as { id: string };
    const [entry] = await db.delete(changelogEntries).where(eq(changelogEntries.id, id)).returning();
    if (!entry) throw Errors.notFound("Entry not found");
    await writeStaffAudit({
      staffUserId: actor.id,
      action: "cms.changelog.delete",
      targetType: "changelog_entry",
      targetId: id,
      metadata: { title: entry.title },
      ip: req.ip,
    });
    triggerRevalidate(["changelog"]);
    return { object: "changelog_entry", id, deleted: true };
  });
}
