"use client";

import { useActionState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A `<form>` whose action can actually report failure.
 *
 * The dashboard is full of `<form action={someServerAction}>` where the action
 * is `Promise<void>` and swallows its own errors. That combination fails
 * silently by construction — a form action's return value is discarded, so even
 * returning `{error}` wouldn't reach anyone. Press delete, the request 403s or
 * 409s, the page revalidates, and it often *looks* like it worked because the
 * row is gone from view until the next real fetch.
 *
 * This is the smallest thing that fixes it: `useActionState` gives the action
 * somewhere to put an error, and the error renders next to the control that
 * caused it. Converting a call site is one import and one tag change.
 *
 *   <ActionForm action={deleteList}>
 *     <input type="hidden" name="id" value={l.id} />
 *     <Button type="submit">Delete</Button>
 *   </ActionForm>
 */

export interface ActionState {
  error?: string;
}

export function ActionForm({
  action,
  children,
  className,
  /** Where the message sits relative to the control. */
  errorClassName,
}: {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  errorClassName?: string;
}) {
  const [state, formAction] = useActionState<ActionState | null, FormData>(action, null);

  return (
    <div className={cn("inline-block", className)}>
      <form action={formAction}>{children}</form>
      {state?.error ? (
        <p
          role="alert"
          className={cn(
            "mt-1 flex items-start gap-1 text-xs text-destructive",
            errorClassName,
          )}
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
