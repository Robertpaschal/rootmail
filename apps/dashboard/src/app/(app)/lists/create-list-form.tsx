"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { type ListFormState, createList } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateListForm() {
  const [state, action, pending] = useActionState<ListFormState | null, FormData>(createList, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row">
      <Input name="name" placeholder="New list name" required className="sm:max-w-xs" />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Create list
      </Button>
      {state?.error ? <p className="self-center text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
