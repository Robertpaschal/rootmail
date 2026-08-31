import Link from "next/link";
import type { DocBlock, HttpMethod, Inline } from "@rootmail/docs";
import { CodeBlock } from "./code-block";
import { cn } from "@/lib/utils";

/**
 * THE DOCS RENDERER — and the last raw palette on this site.
 *
 * This file held all nine remaining `raw-palette` violations: five HTTP-method
 * chips in emerald / blue / amber / violet / rose, three callout tints in
 * blue / emerald / amber, and a `text-rose-500` on the word "required". Every
 * one of them was a Tailwind palette literal with no dark-mode counterpart, on
 * the app that defaults to dark.
 *
 * WHAT REPLACED THEM, AND WHY IT IS NOT JUST "THE SAME COLOURS, TOKENISED".
 *
 * `docs/design/00-PHILOSOPHY.md` §10.2 leaves exactly two things a colour may
 * mean: **brass — you can act on this**, and **witnessed / acted / stopped —
 * what happened to a message or a sender**. An HTTP method is neither. A `GET`
 * is not "witnessed", a `DELETE` is not "stopped", and painting them that way
 * would put the product's state vocabulary on a label that has nothing to do
 * with any message — which is precisely the borrowed-meaning error the rest of
 * the site exists to argue against.
 *
 * So the method chips are monochrome and draw the ONE distinction that changes
 * how careful a reader has to be: **reads are outlined, writes are filled.**
 * The verb itself already says GET from POST from PATCH; the ink does not need
 * to repeat it. (`code-block.tsx` has no syntax highlighter, so there was no
 * third category of colour to resolve here — the sample text is one ink.)
 *
 * Callouts keep three distinguishable treatments without three hues: a plain
 * hairline for `note`, a **brass** rule for `tip` — a tip is something you can
 * go and do, which is what brass means — and a raised ground with an ink label
 * for `warn`. Brass appears once, on the tone where it is literally true.
 *
 * `required` is now weight and case rather than red. It marks a field you must
 * send, not a thing that failed.
 */

/**
 * Reads are outlined, writes are filled. Anything not listed is a write, which
 * is the safe default: a new verb in `@rootmail/docs` gets the more emphatic
 * chip rather than silently rendering as a read.
 */
const READ_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["GET"]);

function methodChip(method: HttpMethod): string {
  return READ_METHODS.has(method)
    ? "border border-rule text-ink-muted"
    : "border border-transparent bg-foreground text-background";
}

const CALLOUT_TONE = {
  note: "border-l-2 border-rule",
  tip: "border-l-2 border-primary",
  warn: "border-l-2 border-rule bg-muted",
} as const;

const CALLOUT_LABEL = {
  note: "text-ink-muted",
  tip: "text-brass-text",
  warn: "text-foreground",
} as const;

/** Render a rich-text run. Internal doc links stay in-app; external go out. */
function Run({ run }: { run: Inline }) {
  if (typeof run === "string") return <>{run}</>;
  if ("code" in run)
    return (
      <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
        {run.code}
      </code>
    );
  if ("strong" in run) return <strong className="font-semibold text-foreground">{run.strong}</strong>;
  const external = run.href.startsWith("http");
  const href = external ? run.href : `/docs/${run.href}`;
  return (
    <Link
      href={href}
      className="font-medium text-brass-text underline-offset-4 hover:underline"
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {run.link}
    </Link>
  );
}

const Runs = ({ content }: { content: Inline[] }) => (
  <>{content.map((r, i) => <Run key={i} run={r} />)}</>
);

/** Render one documentation block into developer-site styling. */
export function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <h2 id={block.id} className="display-s scroll-mt-24 border-t border-rule pt-8">
          {block.text}
        </h2>
      );
    case "prose":
      return (
        <p className="leading-relaxed text-ink-muted">
          <Runs content={block.content} />
        </p>
      );
    case "code":
      return <CodeBlock code={block.code} filename={block.label ?? block.lang} className="text-left" />;
    case "endpoint":
      return (
        <div className="flex items-center gap-3 rounded-lg border border-rule bg-card px-3 py-2.5 shadow-e1">
          <span
            className={cn(
              "shrink-0 rounded-sm px-2 py-0.5 font-mono text-[12.5px] font-medium",
              methodChip(block.method),
            )}
          >
            {block.method}
          </span>
          <code className="shrink-0 font-mono text-[13px] text-foreground" data-fact>
            {block.path}
          </code>
          <span className="ml-auto hidden truncate text-xs text-ink-muted sm:block">
            {block.summary}
          </span>
        </div>
      );
    case "params":
      return (
        <div className="overflow-hidden rounded-lg border border-rule">
          {block.title ? (
            <p className="border-b border-rule bg-muted px-3 py-2 text-[13px] text-ink-muted">
              {block.title}
            </p>
          ) : null}
          <table className="w-full text-sm">
            <tbody className="ruled">
              {block.rows.map((r) => (
                <tr key={r.name} className="align-top">
                  <td className="w-40 p-3">
                    <code className="font-mono text-[13px] text-foreground" data-fact>
                      {r.name}
                    </code>
                    {r.required ? (
                      <span className="ml-1.5 align-[0.15em] font-mono text-[12px] font-medium uppercase tracking-wide text-foreground">
                        required
                      </span>
                    ) : null}
                    <span className="mt-0.5 block font-mono text-[12.5px] text-ink-muted">{r.type}</span>
                  </td>
                  <td className="p-3 text-ink-muted">
                    <Runs content={r.desc} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list":
      return block.ordered ? (
        <ol className="ml-5 list-decimal space-y-1.5 text-ink-muted marker:text-ink-muted">
          {block.items.map((it, i) => (
            <li key={i}>
              <Runs content={it} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="ml-5 list-disc space-y-1.5 text-ink-muted marker:text-ink-muted">
          {block.items.map((it, i) => (
            <li key={i}>
              <Runs content={it} />
            </li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <div
          className={cn(
            "rounded-r-lg px-4 py-3 text-sm text-ink-muted",
            CALLOUT_TONE[block.tone],
          )}
        >
          <span
            className={cn(
              "mr-1.5 font-mono text-[12.5px] font-medium uppercase tracking-wide",
              CALLOUT_LABEL[block.tone],
            )}
          >
            {block.tone === "warn" ? "Careful" : block.tone}
          </span>
          <Runs content={block.content} />
        </div>
      );
  }
}
