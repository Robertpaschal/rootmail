"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, Plus, Search } from "lucide-react";

const OPEN_EVENT = "rootmail:open-command";

const destinations: { label: string; href: string }[] = [
  { label: "Overview", href: "/" },
  { label: "Assistant", href: "/assistant" },
  { label: "Messages", href: "/messages" },
  { label: "Analytics", href: "/analytics" },
  { label: "Deliverability", href: "/deliverability" },
  { label: "Inbox", href: "/inbox" },
  { label: "Templates", href: "/templates" },
  { label: "Sequences", href: "/sequences" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Sub-tenants", href: "/sub-tenants" },
  { label: "Contacts", href: "/contacts" },
  { label: "Lists", href: "/lists" },
  { label: "Import", href: "/import" },
  { label: "API keys", href: "/api-keys" },
  { label: "Compliance", href: "/compliance" },
  { label: "Plan & usage", href: "/billing" },
  { label: "Team", href: "/members" },
  { label: "Roles", href: "/roles" },
  { label: "Test inbox", href: "/test-inbox" },
  { label: "Settings · Profile", href: "/settings/profile" },
  { label: "Settings · Security & login", href: "/settings/security" },
  { label: "Settings · Sender address", href: "/settings/sender" },
];

const actions: { label: string; href: string }[] = [
  { label: "New message", href: "/messages/new" },
  { label: "New template", href: "/templates/new" },
  { label: "New sequence", href: "/sequences/new" },
];

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground";
const groupClass =
  "p-1 text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium";

/** Button (in the topbar) that opens the command menu. */
export function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent sm:inline-flex"
      aria-label="Open command menu"
    >
      <Search className="size-3.5" /> Search
      <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
    </button>
  );
}

/** Global command palette: ⌘K / Ctrl+K (or the topbar button) to jump anywhere. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command menu"
      overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[15%] z-50 w-[92%] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
    >
      <Command.Input
        placeholder="Search pages and actions…"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No results.
        </Command.Empty>
        <Command.Group heading="Go to" className={groupClass}>
          {destinations.map((d) => (
            <Command.Item key={d.href} value={`go ${d.label}`} onSelect={() => go(d.href)} className={itemClass}>
              <ArrowRight className="size-3.5 text-muted-foreground" /> {d.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Actions" className={groupClass}>
          {actions.map((a) => (
            <Command.Item key={a.href} value={`action ${a.label}`} onSelect={() => go(a.href)} className={itemClass}>
              <Plus className="size-3.5 text-muted-foreground" /> {a.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
