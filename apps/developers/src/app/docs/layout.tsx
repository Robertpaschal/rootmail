import { DevFooter, DevNavbar } from "@/components/site/dev-shell";
import { DocsSidebar } from "@/components/site/docs-sidebar";

// The docs shell: navbar on top, a sticky sidebar on the left, content on the
// right, and the site footer beneath the whole container rather than inside the
// article column — /docs/* used to be the one surface with no way out at the
// bottom of a long page. The page supplies its own on-page table of contents.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevNavbar />
      {/* THE ARTICLE IS A SHEET, THE NAVIGATION IS NOT (2026-09-01).

          Every other surface on both sites is now an inset plate on a ground;
          /docs was still a bare container, so the one place a developer reads
          for twenty minutes was the flattest page we ship.

          The slab goes around the ARTICLE only. The sidebar stays on the page
          ground on purpose: it is a map of the sheet you are reading, not part
          of it, and putting both on the same plane is what made this page read
          as one undifferentiated column of text in the first place.

          `.slab` uses `overflow: clip` rather than `hidden` precisely so this
          keeps working — the article carries its own sticky table of contents,
          and `hidden` would create a scroll container and kill it. */}
      <div className="container flex gap-10 py-6 md:py-8">
        <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto pb-10 lg:block">
          <DocsSidebar />
        </aside>
        <main className="slab min-w-0 flex-1 px-5 py-8 sm:px-8 md:px-10 md:py-12">{children}</main>
      </div>
      <DevFooter />
    </>
  );
}
