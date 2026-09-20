import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ConnectionError } from "@/components/app/connection-error";
import { api } from "@/lib/rootmail";

export const metadata = { title: "Product updates · rootmail" };

export default async function ProductUpdatesPage() {
  const response = await api.listProductUpdates().catch(() => null);
  return <div className="space-y-6">
    <Link href="/overview" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Overview</Link>
    <PageHeader title="Product updates" description="Published improvements and fixes to Rootmail. Your own sending events live in the activity log." />
    {!response ? <ConnectionError message="We couldn't load product updates just now." /> : response.data.length === 0 ? <section className="rounded-2xl border bg-card p-6"><p className="text-sm text-muted-foreground">No product updates have been published here yet.</p></section> : response.data.map((entry) => <article key={entry.id} id={entry.id} className="scroll-mt-32 rounded-2xl border bg-card p-5 shadow-e1 sm:p-6">
      <time dateTime={entry.date} className="font-mono text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
      <h2 className="mt-2 text-xl font-semibold">{entry.title}</h2>
      <ul className="mt-4 space-y-3">{entry.changes.map((change, i) => <li key={i} className="grid gap-1 rounded-xl bg-secondary/50 p-4 sm:grid-cols-[6rem_1fr]"><span className="text-sm font-medium capitalize">{change.kind}</span><p className="text-base text-muted-foreground">{change.text}</p></li>)}</ul>
    </article>)}
    <Link href="/activity" className="inline-flex min-h-10 items-center text-sm text-brass-text hover:underline">View your workspace's activity log →</Link>
  </div>;
}
