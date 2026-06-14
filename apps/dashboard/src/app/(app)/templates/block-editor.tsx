"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  BLOCK_LABELS,
  type Align,
  type BlockType,
  type TemplateBlock,
  newBlock,
} from "@/lib/email-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PALETTE: BlockType[] = ["header", "heading", "text", "button", "image", "divider", "spacer"];

export function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: TemplateBlock[];
  onChange: (next: TemplateBlock[]) => void;
}) {
  const update = (id: string, patch: Partial<TemplateBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as TemplateBlock) : b)));

  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((t) => (
          <Button
            key={t}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...blocks, newBlock(t)])}
          >
            <Plus className="size-3.5" /> {BLOCK_LABELS[t]}
          </Button>
        ))}
      </div>

      {blocks.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Add blocks above to start building your email.
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <div key={b.id} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {BLOCK_LABELS[b.type]}
                </span>
                <div className="flex items-center gap-0.5">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => move(b.id, -1)}>
                    <ArrowUp className="size-3.5" />
                  </IconBtn>
                  <IconBtn
                    label="Move down"
                    disabled={i === blocks.length - 1}
                    onClick={() => move(b.id, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconBtn>
                  <IconBtn label="Delete" onClick={() => remove(b.id)} danger>
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                </div>
              </div>
              <BlockFields block={b} update={update} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${
        danger ? "hover:text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}

function AlignSelect({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Align)} aria-label="Align">
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </Select>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-background p-0.5"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-24 font-mono text-xs"
      />
    </label>
  );
}

function BlockFields({
  block,
  update,
}: {
  block: TemplateBlock;
  update: (id: string, patch: Partial<TemplateBlock>) => void;
}) {
  switch (block.type) {
    case "header":
      return (
        <div className="grid gap-2">
          <Input
            value={block.title}
            onChange={(e) => update(block.id, { title: e.target.value })}
            placeholder="Header title (e.g. your brand)"
          />
          <Input
            value={block.logoUrl}
            onChange={(e) => update(block.id, { logoUrl: e.target.value })}
            placeholder="Logo image URL (optional)"
            className="font-mono text-xs"
          />
          <ColorField
            label="Background"
            value={block.bg}
            onChange={(bg) => update(block.id, { bg })}
          />
        </div>
      );
    case "heading":
      return (
        <div className="grid gap-2">
          <Input
            value={block.text}
            onChange={(e) => update(block.id, { text: e.target.value })}
            placeholder="Heading text"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={String(block.level)}
              onChange={(e) => update(block.id, { level: Number(e.target.value) as 1 | 2 | 3 })}
              aria-label="Heading level"
            >
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="3">H3</option>
            </Select>
            <AlignSelect value={block.align} onChange={(align) => update(block.id, { align })} />
          </div>
        </div>
      );
    case "text":
      return (
        <div className="grid gap-2">
          <Textarea
            rows={3}
            value={block.text}
            onChange={(e) => update(block.id, { text: e.target.value })}
            placeholder="Paragraph text — use {{variables}} for per-send values."
          />
          <AlignSelect value={block.align} onChange={(align) => update(block.id, { align })} />
        </div>
      );
    case "button":
      return (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={block.label}
              onChange={(e) => update(block.id, { label: e.target.value })}
              placeholder="Button label"
            />
            <AlignSelect value={block.align} onChange={(align) => update(block.id, { align })} />
          </div>
          <Input
            value={block.href}
            onChange={(e) => update(block.id, { href: e.target.value })}
            placeholder="https://… or {{action_url}}"
            className="font-mono text-xs"
          />
          <ColorField label="Color" value={block.bg} onChange={(bg) => update(block.id, { bg })} />
        </div>
      );
    case "image":
      return (
        <div className="grid gap-2">
          <Input
            value={block.src}
            onChange={(e) => update(block.id, { src: e.target.value })}
            placeholder="Image URL"
            className="font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={block.alt}
              onChange={(e) => update(block.id, { alt: e.target.value })}
              placeholder="Alt text"
            />
            <Input
              value={block.href}
              onChange={(e) => update(block.id, { href: e.target.value })}
              placeholder="Link (optional)"
              className="font-mono text-xs"
            />
          </div>
        </div>
      );
    case "spacer":
      return (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Height (px)</Label>
          <Input
            type="number"
            min={4}
            max={120}
            value={block.size}
            onChange={(e) => update(block.id, { size: Number(e.target.value) || 0 })}
            className="w-24"
          />
        </div>
      );
    case "divider":
      return <p className="text-xs text-muted-foreground">A horizontal divider line.</p>;
  }
}
