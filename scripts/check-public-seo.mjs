// Run after the Next builds. No network, credentials or real email required.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const dev = "apps/developers/.next";
const manifest = JSON.parse(await read(`${dev}/prerender-manifest.json`));
const docs = Object.keys(manifest.routes).filter((path) => path.startsWith("/docs/"));
assert.ok(docs.length > 0, "Public docs must be prerendered, not personalized on the server");
assert.ok(manifest.routes["/"], "Developer homepage must remain prerendered");
const sitemap = await read(`${dev}/server/app/sitemap.xml.body`);
for (const path of docs) {
  assert.ok(sitemap.includes(`<loc>https://developers.rootmail.io${path}</loc>`), `Missing sitemap entry: ${path}`);
  const html = await read(`${dev}/server/app${path}.html`);
  assert.ok(html.includes(`rel="canonical" href="https://developers.rootmail.io${path}"`), `Wrong canonical: ${path}`);
}
assert.ok(!sitemap.includes("<lastmod>"), "Do not invent documentation modification dates");
const robots = await read(`${dev}/server/app/robots.txt.body`);
assert.ok(robots.includes("Sitemap: https://developers.rootmail.io/sitemap.xml"));
assert.ok(robots.includes("Disallow: /api/"));

const marketing = await read("apps/marketing/.next/server/app/sitemap.xml.body");
assert.ok(marketing.includes("<loc>https://rootmail.io/check</loc>"));
assert.ok(marketing.includes("<loc>https://rootmail.io/beta</loc>"));
assert.ok(!marketing.includes("<loc>https://rootmail.io/docs</loc>"), "Do not submit redirect URLs");
for (const entry of marketing.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  if (!entry[1].includes("/blog/")) assert.ok(!entry[1].includes("<lastmod>"), "Static routes have no observed modification date");
}
console.log(`Public SEO checks passed: ${docs.length} prerendered docs, canonical URLs, robots and sitemaps.`);
