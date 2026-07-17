"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ListChecks, Loader2, Plus, X } from "lucide-react";
import { createAudienceAction, type AudienceFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ListTag } from "@/lib/types";

/**
 * Create an audience in plain terms: name it, and choose who starts in it —
 * nobody yet, or everyone carrying a tag. Owns its reveal (right-aligned
 * trigger + full-width panel); on success the action redirects to the new
 * audience's page.
 */
export function NewAudience({ tags, defaultOpen = false }: { tags: ListTag[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex justify-end">
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
          {open ? "Close" : "New audience"}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <NewAudienceForm tags={tags} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NewAudienceForm({ tags }: { tags: ListTag[] }) {
  const [state, formAction, pending] = useActionState<AudienceFormState | null, FormData>(
    createAudienceAction,
    null,
  );
  const [fromTag, setFromTag] = useState("");
  const seed = tags.find((t) => t.tag === fromTag);

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="a-name">Name</Label>
          <Input id="a-name" name="name" placeholder="Newsletter subscribers" required autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="a-desc">Description (optional)</Label>
          <Input id="a-desc" name="description" placeholder="Everyone who opted into the monthly letter" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 sm:max-w-md">
          <Label htmlFor="a-from">Who starts in it?</Label>
          <Select id="a-from" name="from_tag" value={fromTag} onChange={(e) => setFromTag(e.target.value)}>
            <option value="">Nobody yet — I&apos;ll add people</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                everyone tagged “{t.tag}” ({t.contacts})
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            {seed
              ? `Starts with the ${seed.contacts.toLocaleString()} ${seed.contacts === 1 ? "person" : "people"} carrying that tag.`
              : "You can add people from the People tab, an import, or the audience page itself."}
          </p>
        </div>
        {state?.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
            {pending ? "Creating…" : "Create audience"}
          </Button>
        </div>
      </form>
    </div>
  );
}
