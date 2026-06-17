"use client";

import { type ChangeEvent, useRef, useTransition } from "react";
import { Copy, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadAssetAction } from "./actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Asset } from "@/lib/types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetLibrary({ initial }: { initial: Asset[] }) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadAssetAction(fd);
      if (res.error) toast.error(res.error);
      else toast.success("Asset uploaded.");
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {initial.length} asset{initial.length === 1 ? "" : "s"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          hidden
          onChange={onPick}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={pending} size="sm">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={<Upload className="size-6" />}
          title="No assets yet"
          description="Upload an image or PDF to embed it in your templates and emails."
          action={
            <Button onClick={() => inputRef.current?.click()} disabled={pending} size="sm">
              <Upload className="size-4" /> Upload your first asset
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {initial.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center bg-muted">
                {a.content_type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="h-full w-full object-cover" />
                ) : (
                  <FileText className="size-10 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium" title={a.filename}>
                  {a.filename}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => copy(a.url)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3" /> Copy URL
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
