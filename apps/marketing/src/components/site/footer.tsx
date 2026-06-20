import Link from "next/link";
import { Logo } from "./logo";

const CONTACT_EMAIL = "support@rootmail.io";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/#layers" },
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact sales", href: "/contact" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API reference", href: "/docs" },
      { label: "Node SDK", href: "/docs" },
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

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground">
              Email infrastructure that scales with who&apos;s asking. One API, one data model — from
              your first transactional send to legal-grade proof.
            </p>
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
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </Link>
        </div>
      </div>
    </footer>
  );
}
