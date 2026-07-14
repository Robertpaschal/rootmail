import Link from "next/link";
import type { DocBlock, HttpMethod, Inline } from "@rootmail/docs";
import { cn } from "@/lib/utils";

// In-app renderer for the shared docs content. Internal doc links stay inside the
// dashboard (/docs/…); external links (pricing, dashboard deep-links) open out.
const METHOD_TONE: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  PATCH: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  PUT: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  DELETE: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const CALLOUT_TONE = {
  note: "border-blue-500/30 bg-blue-500/5",
  tip: "border-emerald-500/30 bg-emerald-500/5",
  warn: "border-amber-500/30 bg-amber-500/5",
} as const;

// A few doc slugs map to real dashboard pages — deep-link there instead of the doc.
const DEEP_LINKS: Record<string, string> = {
  authentication: "/api-keys",
  webhooks: "/webhooks",
  "client-domains": "/sub-tenants",
  senders: "/settings/sender",
};

function hrefFor(slug: string): string {
  if (slug.startsWith("http")) return slug;
  return `/docs/${slug}`;
}

function Run({ run }: { run: Inline }) {
  if (typeof run === "string") return <>{run}</>;
  if ("code" in run) return <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">{run.code}</code>;
  if ("strong" in run) return <strong className="font-semibold text-foreground">{run.strong}</strong>;
  const external = run.href.startsWith("http");
  return (
    <Link href={hrefFor(run.href)} className="font-medium text-primary underline-offset-4 hover:underline" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {run.link}
    </Link>
  );
}
const Runs = ({ content }: { content: Inline[] }) => <>{content.map((r, i) => <Run key={i} run={r} />)}</>;

export function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "heading":
      return <h2 id={block.id} className="scroll-mt-20 border-t pt-6 text-lg font-semibold tracking-tight">{block.text}</h2>;
    case "prose":
      return <p className="text-sm leading-relaxed text-muted-foreground"><Runs content={block.content} /></p>;
    case "code":
      return (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{block.label ?? block.lang}</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs"><code className="font-mono">{block.code}</code></pre>
        </div>
      );
    case "endpoint": {
      const deep = DEEP_LINKS[""]; // endpoints don't deep-link; kept for parity
      void deep;
      return (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
          <span className={cn("shrink-0 rounded px-2 py-0.5 font-mono text-[11px] font-bold", METHOD_TONE[block.method])}>{block.method}</span>
          <code className="shrink-0 font-mono text-[13px]">{block.path}</code>
          <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:block">{block.summary}</span>
        </div>
      );
    }
    case "params":
      return (
        <div className="overflow-hidden rounded-lg border">
          {block.title ? <p className="border-b bg-secondary/40 px-3 py-2 text-xs font-semibold">{block.title}</p> : null}
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {block.rows.map((r) => (
                <tr key={r.name} className="align-top">
                  <td className="w-36 p-3">
                    <code className="font-mono text-[13px]">{r.name}</code>
                    {r.required ? <span className="ml-1 text-[10px] font-medium text-rose-500">required</span> : null}
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{r.type}</span>
                  </td>
                  <td className="p-3 text-muted-foreground"><Runs content={r.desc} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list":
      return block.ordered ? (
        <ol className="ml-5 list-decimal space-y-1.5 text-sm text-muted-foreground">{block.items.map((it, i) => <li key={i}><Runs content={it} /></li>)}</ol>
      ) : (
        <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">{block.items.map((it, i) => <li key={i}><Runs content={it} /></li>)}</ul>
      );
    case "callout":
      return (
        <div className={cn("rounded-lg border px-4 py-3 text-sm text-muted-foreground", CALLOUT_TONE[block.tone])}>
          <span className="mr-1.5 font-semibold uppercase text-foreground">{block.tone === "warn" ? "Careful" : block.tone}</span>
          <Runs content={block.content} />
        </div>
      );
  }
}
