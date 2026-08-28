"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { cancelSubTenantDkimRotation, rotateSubTenantDkim } from "../actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubTenant } from "@/lib/types";

/**
 * The signing key, and rotating it.
 *
 * The thing this screen has to get across, because getting it wrong is what
 * breaks a domain's mail: during a rotation you ADD the new record, you do not
 * replace the old one. Both are live at once, we keep signing with the current
 * key until the new record resolves, and the old record has to stay up for a
 * while after the switch because mail already sent still verifies against it.
 *
 * So every string here is phrased against the mistake: "alongside", "do not
 * remove", "we'll tell you when".
 */
export function DkimRotation({ st }: { st: SubTenant }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rotating = st.dkim.rotating;

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Signing key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every message for {st.sending_domain} is signed with this key so inboxes can prove it
            really came from them.
          </p>

          <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">In use</dt>
            <dd className="font-mono text-xs">{st.dkim.selector}</dd>
            {st.dkim.rotated_at ? (
              <>
                <dt className="text-muted-foreground">Last rotated</dt>
                <dd>{new Date(st.dkim.rotated_at).toLocaleDateString()}</dd>
              </>
            ) : null}
          </dl>

          {rotating ? (
            <div className="mt-4 rounded-lg border border-acted bg-acted-tint p-4">
              <p className="text-sm font-medium">A new key is waiting on one DNS record</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the record for{" "}
                <span className="font-mono text-xs">{st.dkim.pending_selector}</span>{" "}
                <strong>alongside</strong> the existing one — do not remove the current record. Their
                mail keeps signing with the key in use until the new record resolves, so nothing is
                interrupted while you wait. We check hourly and switch over on our own.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                The exact record is in the DNS list above, marked as the new signing key.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await cancelSubTenantDkimRotation(st.id);
                    setError(r.error ?? null);
                  })
                }
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
              >
                {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Cancel this rotation
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await rotateSubTenantDkim(st.id);
                  setError(r.error ?? null);
                })
              }
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}
            >
              {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Rotate the signing key
            </button>
          )}

          {st.dkim.previous_selector ? (
            // The most dangerous moment is right after a successful cutover, when
            // the old record looks obsolete and is not.
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              Keep the old record{" "}
              <span className="font-mono">{st.dkim.previous_selector}._domainkey.{st.sending_domain}</span>{" "}
              in place
              {st.dkim.previous_removable_after
                ? ` until ${new Date(st.dkim.previous_removable_after).toLocaleDateString()}`
                : ""}
              . Mail already sent is still checked against it, and removing it early makes those
              messages look unsigned.
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-stopped" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
