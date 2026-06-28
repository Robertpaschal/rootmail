import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Renders assistant replies as markdown, styled to match the app and dark-mode
// friendly. Safe by default: react-markdown does NOT render raw HTML unless a
// rehype-raw plugin is added (we don't), so any embedded HTML/script is inert.
// Element styling lives here (rather than a Tailwind typography plugin) to keep
// the dependency surface small and the look consistent with the design tokens.

const components: Components = {
  h1: ({ className, ...props }: ComponentPropsWithoutRef<"h1">) => (
    <h1 className={cn("mt-3 mb-1.5 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2 className={cn("mt-3 mb-1.5 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3 className={cn("mt-2.5 mb-1 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className={cn("my-1.5 leading-relaxed first:mt-0 last:mb-0", className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul className={cn("my-1.5 ml-4 list-disc space-y-0.5 first:mt-0 last:mb-0", className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol className={cn("my-1.5 ml-4 list-decimal space-y-0.5 first:mt-0 last:mb-0", className)} {...props} />
  ),
  li: ({ className, ...props }: ComponentPropsWithoutRef<"li">) => (
    <li className={cn("leading-relaxed [&>ul]:my-0.5 [&>ol]:my-0.5", className)} {...props} />
  ),
  a: ({ className, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      className={cn("font-medium text-primary underline underline-offset-2 hover:opacity-80", className)}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  strong: ({ className, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  em: ({ className, ...props }: ComponentPropsWithoutRef<"em">) => (
    <em className={cn("italic", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className={cn("my-1.5 border-l-2 border-border pl-3 italic text-muted-foreground", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }: ComponentPropsWithoutRef<"hr">) => (
    <hr className={cn("my-3 border-border", className)} {...props} />
  ),
  // Inline code vs. fenced block: react-markdown v9 sets no `inline` flag, so we
  // distinguish by the presence of a `language-*` className (only fenced blocks
  // carry one) and whether the content spans newlines.
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    if (isBlock) {
      return (
        <code className={cn("font-mono text-[0.8em]", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em] text-foreground ring-1 ring-border/60",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ className, ...props }: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className={cn(
        "my-2 overflow-x-auto rounded-md border border-border bg-background/60 p-3 text-foreground first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-2 overflow-x-auto">
      <table className={cn("w-full border-collapse text-left", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th className={cn("border border-border px-2 py-1 font-semibold", className)} {...props} />
  ),
  td: ({ className, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td className={cn("border border-border px-2 py-1", className)} {...props} />
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
