import type { Metadata } from "next";
import { MessageSquareHeart, Unlock, Users } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { WaitlistForm } from "./waitlist-form";

const title = "Join the rootmail beta";
const description =
  "rootmail is in closed beta: transactional and marketing email under one roof. Ask for an invite — testers get everything unlocked.";

/**
 * The link we hand out.
 *
 * This is what goes in an X bio, a DM, a launch post — so the card is the
 * feature, not decoration: a bare rootmail.io/beta with no preview renders as a
 * grey rectangle nobody clicks. The image itself comes from the sibling
 * opengraph-image.tsx, which Next wires into these tags automatically.
 */
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "https://rootmail.io/beta" },
  openGraph: {
    type: "website",
    siteName: "rootmail",
    title,
    description,
    url: "https://rootmail.io/beta",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: true, follow: true },
};

const PROMISES = [
  {
    icon: Unlock,
    title: "Everything unlocked",
    body: "Every feature on both wings, no plan and no card. We can't learn what's worth paying for from someone standing behind a paywall.",
  },
  {
    icon: MessageSquareHeart,
    title: "You talk to a person",
    body: "Reply to any email we send and it reaches us, not a ticket queue. Tell us what's confusing, broken, or missing — that's the whole deal.",
  },
  {
    icon: Users,
    title: "A few at a time",
    body: "We invite in small batches so the people already inside get real attention. It's a wait, but it's a short one.",
  },
];

export default function BetaPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <Badge variant="secondary">Closed beta</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Help us build rootmail
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Your receipts and your newsletter are both just email — so rootmail runs them under one
            roof, one audience, one reputation. It works today, and it&apos;s early enough that what
            you say still changes it.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <WaitlistForm />
          </div>

          <div className="space-y-6 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What being a tester means
            </h2>
            {PROMISES.map((p) => (
              <div key={p.title} className="flex gap-3">
                <p.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 className="font-medium">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                Already have an invite code?{" "}
                <a
                  href="https://app.rootmail.io/signup"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Create your account
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
