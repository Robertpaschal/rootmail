import type { DocPage, DocSection } from "./types";
import { authentication, baseUrl, quickstart } from "./content/getting-started";
import { errors, idempotency, pagination, rateLimits, sandbox } from "./content/concepts";
import { messages, senders, suppressions, templates } from "./content/sending";
import { contacts, imports, lists } from "./content/audience";
import { campaigns, sequences, threads } from "./content/marketing";
import { assistant, clientDomains, compliance, insights, webhooks } from "./content/platform";
import { cli, migration, sdk } from "./content/tooling";

export * from "./types";

/** The docs tree — the single source of truth rendered by BOTH the developers
 * site (developers.gateml.io/docs) and the in-app dashboard docs. Order here is
 * the sidebar order. */
export const DOCS: DocSection[] = [
  { label: "Getting started", pages: [quickstart, authentication, baseUrl] },
  { label: "Core concepts", pages: [idempotency, pagination, errors, sandbox, rateLimits] },
  { label: "Sending", pages: [messages, templates, senders, suppressions] },
  { label: "Audience", pages: [contacts, lists, imports] },
  { label: "Marketing", pages: [campaigns, sequences, threads] },
  { label: "Platform", pages: [clientDomains, webhooks, insights, compliance, assistant] },
  { label: "Tooling", pages: [sdk, cli, migration] },
];

/** Flat list of every page in sidebar order (for prev/next + static params). */
export const ALL_PAGES: DocPage[] = DOCS.flatMap((s) => s.pages);

/** The default landing page slug. */
export const DOCS_HOME = quickstart.slug;

/** Look a page up by slug. */
export function getPage(slug: string): DocPage | undefined {
  return ALL_PAGES.find((p) => p.slug === slug);
}

/** Previous / next page for footer navigation. */
export function siblings(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = ALL_PAGES.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { prev: ALL_PAGES[i - 1], next: ALL_PAGES[i + 1] };
}

/** The section a page belongs to (for breadcrumbs). */
export function sectionOf(slug: string): DocSection | undefined {
  return DOCS.find((s) => s.pages.some((p) => p.slug === slug));
}

/** Heading anchors on a page, for an on-page table of contents. */
export function tableOfContents(page: DocPage): { id: string; text: string }[] {
  return page.blocks.flatMap((b) => (b.kind === "heading" ? [{ id: b.id, text: b.text }] : []));
}
