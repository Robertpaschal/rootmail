"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { subscribeAction, type SubscribeResult } from "./actions";

// The hosted signup form — intentionally dependency-light and calm: this page
// carries the CUSTOMER'S brand (their name, their audience), not rootmail's UI.
export function SignupForm({
  listId,
  orgName,
  redirectUrl,
}: {
  listId: string;
  orgName: string;
  redirectUrl: string | null;
}) {
  const [result, setResult] = useState<SubscribeResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.state) {
    const [Icon, title, body] =
      result.state === "confirm_sent"
        ? [MailCheck, "Check your email", `We've sent a confirmation link. Click it and you're on the list.`]
        : result.state === "subscribed"
          ? [CheckCircle2, "You're subscribed", `Welcome — you'll hear from ${orgName} soon.`]
          : [CheckCircle2, "You're on the list", `${orgName} will finish adding you shortly.`];
    return (
      <div className="text-center">
        <Icon className="mx-auto mb-3 size-10 text-emerald-600" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{body}</p>
        {result.state === "subscribed" && redirectUrl ? (
          <a
            href={redirectUrl}
            className="mt-4 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Continue
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setResult(await subscribeAction(listId, fd));
        })
      }
      className="space-y-3"
    >
      <div>
        <label htmlFor="sub-name" className="mb-1 block text-sm font-medium text-neutral-700">
          Name <span className="font-normal text-neutral-400">(optional)</span>
        </label>
        <input
          id="sub-name"
          name="name"
          autoComplete="name"
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          placeholder="Ada Lovelace"
        />
      </div>
      <div>
        <label htmlFor="sub-email" className="mb-1 block text-sm font-medium text-neutral-700">
          Email
        </label>
        <input
          id="sub-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          placeholder="you@example.com"
        />
      </div>
      {/* Honeypot — visually hidden; bots fill it, humans never see it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {result?.error ? <p className="text-sm text-red-600">{result.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} Subscribe
      </button>
    </form>
  );
}
