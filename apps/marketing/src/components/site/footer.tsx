import Link from "next/link";
import { Github, Twitter } from "lucide-react";
import { Logo } from "./logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/#platform" },
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "developers.gateml.io", href: "https://developers.gateml.io" },
      { label: "Documentation", href: "https://developers.gateml.io/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
      { label: "Talk to sales", href: "/contact?topic=sales" },
      { label: "Support", href: "/contact?topic=support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Security", href: "/legal/security" },
    ],
  },
];

const socials = [
  { label: "rootmail on X", href: "https://x.com/rootmail", icon: Twitter },
  { label: "rootmail on GitHub", href: "https://github.com/rootmail", icon: Github },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground">
              Email infrastructure that scales with who&apos;s asking. One platform, one data model —
              from your first welcome email to legal-grade proof.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="grid size-9 place-items-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  <s.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} rootmail. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Need a hand?{" "}
            <Link href="/contact" className="font-medium text-foreground transition-colors hover:underline">
              Get in touch
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
