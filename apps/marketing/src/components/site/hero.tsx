import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CodeBlock } from "./code-block";
import { signupUrl } from "@/lib/links";
import { cn } from "@/lib/utils";

const snippet = `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

await mail.send({
  to: "ada@example.com",
  template: "welcome",
  variables: { name: "Ada", product: "rootmail" },
  idempotencyKey: \`welcome-\${user.id}\`,
});`;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_55%,transparent_100%)]"
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 top-[-10%] -z-10 h-[420px] w-[720px] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]"
        aria-hidden="true"
      />

      <div className="container flex flex-col items-center gap-10 py-20 text-center md:py-28">
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <Link href="#platform">
            <Badge variant="muted" className="py-1 pl-2.5 pr-2.5">
              Send, reply, and prove — from one place
              <ArrowRight className="size-3" />
            </Badge>
          </Link>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Email infrastructure that{" "}
            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              scales with who&apos;s asking.
            </span>
          </h1>

          <p className="max-w-2xl text-balance text-lg text-muted-foreground">
            Reach your customers from a no-code dashboard or a typed API — both on the same core that
            stays dead-simple for a single welcome email and grows into sub-tenancy, full audit
            trails, and legal-grade proof the moment you need them. One platform. One data model.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link href={signupUrl} className={cn(buttonVariants({ size: "lg" }))}>
              Start sending <ArrowRight className="size-4" />
            </Link>
            <Link href="/docs" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              <BookOpen className="size-4" /> Read the docs
            </Link>
          </div>

          <p className="text-sm text-muted-foreground">
            No-code dashboard · typed SDK &amp; CLI · works without writing code · no credit card to
            start
          </p>
        </div>

        <CodeBlock code={snippet} filename="send.ts" className="w-full max-w-2xl text-left" />
      </div>
    </section>
  );
}
