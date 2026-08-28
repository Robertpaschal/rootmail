"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { removeSubTenant, renameSubTenant } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Rename and remove, on the client domain itself.
 *
 * Until now this resource was create-and-read only — no PATCH, no DELETE in the
 * API — so an agency could add a client and then never fix a typo in their name
 * or take them off the account. Every other collection in the product can be
 * edited and removed; this closes the one that couldn't.
 *
 * The sending DOMAIN stays fixed on purpose: the DKIM key and every verified DNS
 * record are bound to it, so "changing" it really means removing this one and
 * adding the right one. The copy says that rather than hiding it.
 */
export function ManageSubTenant({ id, name, domain }: { id: string; name: string; domain: string }) {
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const res = await renameSubTenant(id, value);
      if (res.error) return setError(res.error);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const res = await removeSubTenant(id);
      // Success redirects; only a failure comes back.
      if (res?.error) setError(res.error);
    });

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Client name</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How {domain} appears in your list. The sending domain itself can&apos;t change — the DKIM key
            and verified records are tied to it, so a different domain means adding a new one.
          </p>
          <AnimatePresence initial={false} mode="wait">
            {editing ? (
              <motion.div
                key="edit"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="max-w-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") {
                        setValue(name);
                        setEditing(false);
                      }
                    }}
                  />
                  <Button size="sm" onClick={save} disabled={pending || !value.trim()}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setValue(name);
                      setEditing(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="view"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 flex items-center gap-2 text-sm"
              >
                <span className="font-medium">{name}</span>
                {saved ? (
                  <span className="inline-flex items-center gap-1 text-xs text-witnessed">
                    <Check className="size-3.5" /> Saved
                  </span>
                ) : null}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {!editing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Rename
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Remove this client domain</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sending as {domain} stops immediately. Mail already sent keeps its records — this only removes
            the domain from your account.
          </p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {confirming ? (
            <motion.div
              key="confirm"
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <span className="text-xs text-muted-foreground">Remove {domain}?</span>
              <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-3.5" />}
                Yes, remove
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Keep it
              </button>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t text-sm text-destructive"
          >
            <span className="block px-5 py-3">{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
