import { DevNavbar } from "@/components/site/dev-shell";
import { DocsSidebar } from "@/components/site/docs-sidebar";

// The docs shell: navbar on top, a sticky sidebar on the left, content on the
// right. The page supplies its own on-page table of contents.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevNavbar />
      <div className="container flex gap-10 py-10">
        <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto pb-10 lg:block">
          <DocsSidebar />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
