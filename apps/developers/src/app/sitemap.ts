import type { MetadataRoute } from "next";
import { ALL_PAGES } from "@rootmail/docs";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", ...ALL_PAGES.map((page) => `/docs/${page.slug}`)].map((path) => ({
    url: `https://developers.rootmail.io${path}`,
  }));
}
