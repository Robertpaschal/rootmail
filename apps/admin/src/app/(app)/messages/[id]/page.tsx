import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi, ApiError } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Message" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let m;
  try {
    m = await adminApi.getMessage(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="space-y-6">
      <div>
        {m.organization ? (
          <Link
            href={`/orgs/${m.organization.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {m.organization.name}
          </Link>
        ) : (
          <Link
            href="/orgs"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Organizations
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{m.subject}</h1>
          <StatusBadge status={m.status} />
          <Badge variant="secondary">{m.type}</Badge>
          {m.sandbox ? <Badge variant="muted">sandbox</Badge> : null}
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{m.id}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="To">{m.to}</Row>
          <Row label="From">
            {m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email}
          </Row>
          <Row label="Reply-To">{m.reply_to ?? "—"}</Row>
          <Row label="Provider">
            {m.provider ?? "—"}
            {m.provider_message_id ? (
              <span className="font-mono text-xs"> · {m.provider_message_id}</span>
            ) : null}
          </Row>
          <Row label="Created">{formatDateTime(m.created_at)}</Row>
          {m.error ? (
            <Row label="Error">
              <span className="text-destructive">{m.error}</span>
            </Row>
          ) : null}
          <Row label="Content hash">
            {m.content_hash ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                {m.content_hash}
              </span>
            ) : (
              <span className="text-muted-foreground">— (no proof bundle)</span>
            )}
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          {m.audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events recorded.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-6">
              {m.audit.map((a, i) => (
                <li key={`${a.event}-${i}`} className="relative">
                  <span className="absolute -left-[1.65rem] top-1.5 size-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.event}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(a.timestamp)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.actor}
                    {a.ip ? ` · ${a.ip}` : ""}
                    {a.provider ? ` · ${a.provider}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
