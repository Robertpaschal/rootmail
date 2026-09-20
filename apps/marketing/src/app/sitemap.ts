import type { MetadataRoute } from "next";
import { getPublicBlog, isArticle } from "@/lib/blog";

const BASE = "https://rootmail.io";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/check", priority: 0.8, changeFrequency: "monthly" },
    { path: "/beta", priority: 0.5, changeFrequency: "monthly" },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" },
    { path: "/changelog", priority: 0.7, changeFrequency: "weekly" },
    { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
    { path: "/careers", priority: 0.5, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/acceptable-use", priority: 0.4, changeFrequency: "yearly" },
    { path: "/legal/dpa", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/security", priority: 0.4, changeFrequency: "monthly" },
  ];

  const articleRoutes = (await getPublicBlog()).filter(isArticle).map((p) => ({
    url: `${BASE}/blog/${encodeURIComponent(p.slug)}`,
    ...(Number.isNaN(Date.parse(p.date)) ? {} : { lastModified: new Date(p.date) }),
    priority: 0.6,
    changeFrequency: "monthly" as const,
  }));

  return [...routes.map((r) => ({
    url: `${BASE}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  })), ...articleRoutes];
}
