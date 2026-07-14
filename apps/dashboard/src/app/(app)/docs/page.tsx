import Link from "next/link";
import { ArrowRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { DOCS } from "@rootmail/docs";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

// The in-app docs index. Renders the SAME content tree as developers.gateml.io —
// one source of truth — with the dashboard's chrome.
export default function DocsIndex() {
  return (
    <>
      <PageHeader
        title="Developer docs"
        description="Send through the REST API, the @rootmail/node SDK, or the CLI. Everyday work needs none of this — it's here for when you integrate. Everything the dashboard does, the API does."
        actions={
          <a
            href="https://developers.gateml.io/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Full reference site <ExternalLink className="size-3.5" />
          </a>
        }
      />
      <div className="space-y-6">
        {DOCS.map((section) => (
          <div key={section.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{section.label}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.pages.map((page) => (
                <Link key={page.slug} href={`/docs/${page.slug}`} className="group block">
                  <Card className="h-full transition-colors group-hover:border-primary/40">
                    <CardContent className="p-4">
                      <p className="flex items-center gap-1 font-medium">
                        {page.title}
                        <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{page.summary}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}

        <p className="text-sm text-muted-foreground">
          Want the assistant to wire something up?{" "}
          <Link href="/assistant" className="inline-flex items-center gap-1 text-primary hover:underline">
            Ask it to build or debug a send <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </>
  );
}
