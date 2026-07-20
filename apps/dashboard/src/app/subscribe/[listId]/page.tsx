import type { Metadata } from "next";
import { CheckCircle2, MailCheck } from "lucide-react";
import { SignupForm } from "./signup-form";

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

interface SubscribeInfo {
  list_id: string;
  audience_name: string;
  org_name: string;
  double_opt_in: boolean;
  redirect_url: string | null;
}

async function loadInfo(listId: string): Promise<SubscribeInfo | null> {
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/v1/subscribe/info?list=${encodeURIComponent(listId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SubscribeInfo;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ listId: string }> }): Promise<Metadata> {
  const { listId } = await params;
  const info = await loadInfo(listId);
  return { title: info ? `Subscribe · ${info.org_name}` : "Subscribe" };
}

// The PUBLIC hosted signup page for one audience — the link a customer shares on
// their site, bio, or blog. Branded with THEIR name; rootmail stays a whisper in
// the footer. ?state=… renders the post-submit screens for embed-form redirects.
export default async function HostedSubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { listId } = await params;
  const { state } = await searchParams;
  const info = await loadInfo(listId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-10">
      <div className="w-full max-w-md">
        {!info ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-neutral-900">This page isn't available</h1>
            <p className="mt-1 text-sm text-neutral-600">
              This signup link is no longer active. If someone sent it to you, let them know.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-neutral-900 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{info.org_name}</p>
            <h1 className="mt-1 text-2xl font-bold">{info.audience_name}</h1>
            <p className="mb-6 mt-2 text-sm text-neutral-600">
              {info.double_opt_in
                ? "Enter your email and confirm from your inbox — no spam, unsubscribe anytime."
                : "Enter your email to join — no spam, unsubscribe anytime."}
            </p>

            {state === "confirm_sent" ? (
              <div className="text-center">
                <MailCheck className="mx-auto mb-3 size-10 text-emerald-600" />
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="mt-1 text-sm text-neutral-600">Click the confirmation link we just sent and you're on the list.</p>
              </div>
            ) : state === "subscribed" || state === "waitlisted" ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-600" />
                <h2 className="text-lg font-semibold">{state === "subscribed" ? "You're subscribed" : "You're on the list"}</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  {state === "subscribed" ? `Welcome — you'll hear from ${info.org_name} soon.` : `${info.org_name} will finish adding you shortly.`}
                </p>
              </div>
            ) : (
              <SignupForm listId={info.list_id} orgName={info.org_name} redirectUrl={info.redirect_url} />
            )}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-neutral-400">
          Powered by <span className="font-medium text-neutral-500">rootmail</span>
        </p>
      </div>
    </div>
  );
}
