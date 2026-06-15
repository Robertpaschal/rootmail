"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { type CampaignFormState, createCampaign } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function CampaignComposer({
  lists,
  templates,
}: {
  lists: { id: string; name: string }[];
  templates: { id: string; name: string; slug: string }[];
}) {
  const [state, action, pending] = useActionState<CampaignFormState | null, FormData>(createCampaign, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" name="name" placeholder="June newsletter" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="list_id">List</Label>
        <Select id="list_id" name="list_id" required defaultValue="">
          <option value="" disabled>
            Pick a list…
          </option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="template_id">Template</Label>
        <Select id="template_id" name="template_id" required defaultValue="">
          <option value="" disabled>
            Pick a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Create campaign
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
