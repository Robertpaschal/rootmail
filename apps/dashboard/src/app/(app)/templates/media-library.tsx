"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, ImagePlus, Loader2, Trash2, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { deleteAssetAction, listAssetsAction, uploadAssetAction } from "./actions";
import type { Asset } from "@/lib/types";

/**
 * The studio's media library. Assets only matter *inside* an email, so this is
 * where they live: picking an image opens the library — reuse anything you've
 * uploaded before, upload something new, or delete what you no longer need.
 *
 * Exposed as a promise API (`pickMedia`) so editor call sites stay one-liners:
 * `const src = await pickMedia("image/*")`. The host component registers a
 * module-level opener on mount; without a host we fall back to a bare upload.
 */

type Opener = (accept: string) => Promise<string | null>;
let opener: Opener | null = null;

/** Open a file picker, upload via the server action, return the public URL. */
function uploadDirect(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadAssetAction(fd);
      if (res.error) {
        window.alert(res.error);
        return resolve(null);
      }
      resolve(res.url ?? null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Pick media for the email: library if mounted, plain upload otherwise. */
export function pickMedia(accept = "image/*"): Promise<string | null> {
  return opener ? opener(accept) : uploadDirect(accept);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Pending {
  accept: string;
  resolve: (url: string | null) => void;
}

export function MediaLibraryHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    opener = (accept) =>
      new Promise<string | null>((resolve) => {
        setPending((prev) => {
          // A second open while one is pending cancels the first cleanly.
          prev?.resolve(null);
          return { accept, resolve };
        });
      });
    return () => {
      opener = null;
    };
  }, []);

  // (Re)load the library each time it opens — cheap, and always current.
  useEffect(() => {
    if (!pending) return;
    setAssets(null);
    void listAssetsAction().then((res) => {
      if (res.error) toast.error(res.error);
      setAssets(res.assets ?? []);
    });
  }, [pending]);

  const close = useCallback(
    (url: string | null) => {
      pending?.resolve(url);
      setPending(null);
    },
    [pending],
  );

  // Escape closes (cancels) the dialog.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  const upload = () => {
    if (!pending || busy) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = pending.accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadAssetAction(fd);
      setBusy(false);
      if (res.error) return void toast.error(res.error);
      // Uploading *is* choosing — drop it straight into the email.
      if (res.url) close(res.url);
    };
    input.click();
  };

  const remove = async (a: Asset) => {
    if (
      !window.confirm(
        `Delete "${a.filename}"? Emails you've already sent that show this file will display a broken image.`,
      )
    )
      return;
    const res = await deleteAssetAction(a.id);
    if (res.error) return void toast.error(res.error);
    setAssets((list) => list?.filter((x) => x.id !== a.id) ?? null);
    toast.success("Deleted.");
  };

  // When inserting an image, only images make sense to reuse.
  const usable = (assets ?? []).filter((a) =>
    pending?.accept.startsWith("image") ? a.content_type.startsWith("image/") : true,
  );

  return (
    <AnimatePresence>
      {pending ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => close(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16 }}
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Media library</p>
                <p className="text-xs text-muted-foreground">Pick something you&apos;ve used before, or upload new.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={upload}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {busy ? "Uploading…" : "Upload new"}
                </button>
                <button
                  type="button"
                  onClick={() => close(null)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-h-40 flex-1 overflow-y-auto p-4">
              {assets === null ? (
                <div className="grid h-32 place-items-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : usable.length === 0 ? (
                <div className="grid h-40 place-items-center text-center">
                  <div>
                    <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
                      <ImagePlus className="size-5" />
                    </span>
                    <p className="text-sm font-medium">Nothing here yet</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Upload an image and it&apos;ll be reusable in every template and email.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {usable.map((a) => {
                    const isImage = a.content_type.startsWith("image/");
                    const isVideo = a.content_type.startsWith("video/");
                    return (
                      <div key={a.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => close(a.url)}
                          className="block w-full overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-primary"
                          title={`Use ${a.filename}`}
                        >
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
                          ) : (
                            <span className="grid aspect-square w-full place-items-center text-muted-foreground">
                              {isVideo ? <Video className="size-7" /> : <FileText className="size-7" />}
                            </span>
                          )}
                          <span className="block truncate border-t px-2 py-1 text-[11px] text-muted-foreground">
                            {a.filename} · {formatBytes(a.size)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(a)}
                          className="absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow transition-opacity hover:text-destructive group-hover:opacity-100"
                          aria-label={`Delete ${a.filename}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
