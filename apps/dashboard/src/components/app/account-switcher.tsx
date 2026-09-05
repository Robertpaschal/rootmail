"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, TriangleAlert, UserPlus } from "lucide-react";
import type { AccountsView } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import {
  dismissExpiredAccounts,
  signOutAccount,
  signOutAllAccounts,
  switchAccount,
} from "./account-actions";

/**
 * The account menu — who you are signed in AS, and every other identity this
 * browser is signed into.
 *
 * ── WHY IT LIVES ON THE AVATAR, NOT NEXT TO THE WORKSPACE PICKER ──────────
 * There are two switchers in this top bar and they are NOT siblings. A
 * workspace is a thing INSIDE an account; an account is a different person's
 * login. Two identical pills side by side would invite exactly the confusion
 * that matters most ("did I just switch company or identity?"), so this one is
 * anchored on the avatar — the universal "who am I" affordance — while the
 * workspace pill keeps its place in the middle of the bar. The nesting is then
 * spelled out in words: every account row names the workspace it is currently
 * in, so the menu reads "this identity, in that workspace".
 *
 * It also absorbs Sign out, which used to be a bare button beside it. With more
 * than one account signed in, an unqualified "Sign out" is a question, not a
 * command: out of which one? Here it can name the account it will end.
 */
export function AccountSwitcher({ view }: { view: AccountsView }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const current = view.entries.find((e) => e.active) ?? null;
  const others = view.entries.filter((e) => !e.active);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  function onSwitch(index: number) {
    setError(null);
    startTransition(async () => {
      const res = await switchAccount(index);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  function onDismissExpired() {
    setError(null);
    startTransition(async () => {
      await dismissExpiredAccounts();
    });
  }

  return (
    <div ref={rootRef} className="static shrink-0 sm:relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Your accounts"
        className="inline-flex max-w-[13rem] items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Avatar entry={current} className="size-6 text-[12px]" />
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {current.name || current.email}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-4 right-4 top-full z-50 mt-1.5 w-auto overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg sm:left-auto sm:right-0 sm:w-[19rem]"
        >
          {/* Who you are right now, and where inside that account you are. */}
          <div className="flex items-center gap-3 border-b px-3 py-3">
            <Avatar entry={current} className="size-9 text-xs" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {current.name || current.email}
              </p>
              {current.name ? (
                <p className="truncate text-xs text-muted-foreground">{current.email}</p>
              ) : null}
              {current.workspaceName ? (
                <p className="truncate text-[12.5px] text-muted-foreground">
                  in {current.workspaceName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="p-1">
            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Settings className="size-4 text-muted-foreground" /> Account &amp; settings
            </Link>
          </div>

          {others.length > 0 ? (
            <>
              <div className="border-t px-3 pb-1 pt-2 text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Switch account
              </div>
              <ul className="max-h-64 overflow-y-auto p-1">
                {others.map((entry) => (
                  <li key={entry.index}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pending}
                      onClick={() => onSwitch(entry.index)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <Avatar entry={entry} className="size-7 text-[12px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {entry.name || entry.email}
                        </span>
                        <span className="block truncate text-[12.5px] text-muted-foreground">
                          {entry.name ? entry.email : null}
                          {entry.name && entry.workspaceName ? " · " : null}
                          {entry.workspaceName ? `in ${entry.workspaceName}` : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {/* A session that died in the background. We cannot name it — the
              token that could have is exactly the thing that stopped working —
              so say plainly that it happened rather than quietly showing a
              shorter list than the user remembers. */}
          {view.expiredCount > 0 ? (
            <div className="border-t bg-muted/40 px-3 py-2.5">
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-acted" />
                <span>
                  {view.expiredCount === 1
                    ? "One other account was signed out — its session expired."
                    : `${view.expiredCount} other accounts were signed out — their sessions expired.`}
                </span>
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={onDismissExpired}
                className="mt-1.5 text-xs font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="border-t p-1">
            {view.canAdd ? (
              <Link
                href="/login?add=1"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <UserPlus className="size-4 text-muted-foreground" /> Add another account
              </Link>
            ) : view.impersonating ? (
              /* Say why the door is missing. A support session that silently
                 lacks the controls every other session has reads as a bug. */
              <p className="px-2 py-2 text-xs text-muted-foreground">
                This is a support session, so it stands alone — stop impersonating to get back to
                your own accounts.
              </p>
            ) : (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                You&apos;re signed into {view.max} accounts — the most one browser can hold. Sign
                out of one to add another.
              </p>
            )}
          </div>

          <div className="border-t p-1">
            <form action={signOutAccount}>
              <button
                type="submit"
                disabled={pending}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                <LogOut className="size-4 text-muted-foreground" />
                <span className="min-w-0 truncate">
                  Sign out{others.length > 0 ? ` of ${current.email}` : ""}
                </span>
              </button>
            </form>
            {others.length > 0 ? (
              <form action={signOutAllAccounts}>
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  Sign out of all accounts
                </button>
              </form>
            ) : null}
          </div>

          {error ? (
            <p className="border-t px-3 py-2 text-[12.5px] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string | null, email: string): string {
  const base = (name ?? "").trim() || email;
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? base[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

function Avatar({
  entry,
  className,
}: {
  entry: { name: string | null; email: string; avatarUrl: string | null };
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-semibold text-foreground",
        className,
      )}
    >
      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(entry.name, entry.email)
      )}
    </span>
  );
}
