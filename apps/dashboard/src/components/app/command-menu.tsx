"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, Plus, Search } from "lucide-react";

const OPEN_EVENT = "rootmail:open-command";

// Each entry carries keyword synonyms so search is forgiving (Spotlight-like):
// typing "billing", "spf", or "domain" finds the right place even if the label
// doesn't contain the word. `value` = label + keywords; children render the label.
interface Item {
  label: string;
  href: string;
  kw?: string;
}

const SHARED: Item[] = [
  { label: "Overview", href: "/", kw: "home dashboard start" },
  { label: "Assistant", href: "/assistant", kw: "ai help chat copilot diagnose" },
];

const TX: Item[] = [
  { label: "Messages", href: "/messages", kw: "sends log transactional history" },
  { label: "Templates & blocks", href: "/templates", kw: "design studio email layout" },
  { label: "API keys", href: "/api-keys", kw: "developer secret token integrate" },
  { label: "Webhooks", href: "/webhooks", kw: "events callbacks notifications" },
  { label: "Deliverability", href: "/deliverability", kw: "spf dkim dmarc reputation score inbox" },
  { label: "Client domains", href: "/sub-tenants", kw: "sub-tenants sending domain clients tenants" },
  { label: "Test inbox", href: "/test-inbox", kw: "sandbox preview safe" },
  { label: "Docs", href: "/docs", kw: "api reference developer guide" },
];

const MK: Item[] = [
  { label: "Campaigns", href: "/campaigns", kw: "broadcast blast newsletter marketing" },
  { label: "Sequences", href: "/sequences", kw: "automation drip flow onboarding" },
  { label: "Replies", href: "/inbox", kw: "inbox conversations threads responses" },
  { label: "Contacts", href: "/contacts", kw: "audience people subscribers" },
  { label: "Audiences", href: "/lists", kw: "lists segments groups subsets people" },
  { label: "Import", href: "/import", kw: "upload csv contacts migrate" },
  { label: "Analytics", href: "/analytics", kw: "opens clicks funnel stats reports" },
];

const WORKSPACE: Item[] = [
  { label: "Plan & usage", href: "/billing", kw: "billing subscription overage quota invoice" },
  { label: "Transactional pricing", href: "/billing/transactional", kw: "send blocks volume upgrade overage buy sends" },
  { label: "Marketing pricing", href: "/billing/marketing", kw: "contacts brackets audience upgrade" },
  { label: "Add-ons", href: "/billing/addons", kw: "seats workspaces roles sso team add-ons addons ai credits packs dedicated ip platform" },
  { label: "Team", href: "/members", kw: "members invite users seats people" },
  { label: "Roles", href: "/roles", kw: "permissions rbac access control" },
  { label: "Compliance", href: "/compliance", kw: "residency soc2 proof gdpr privacy" },
];

const SETTINGS: Item[] = [
  { label: "Settings · Profile", href: "/settings/profile", kw: "account name avatar" },
  { label: "Settings · Security & login", href: "/settings/security", kw: "password mfa 2fa sso" },
  { label: "Settings · Sending", href: "/settings/sender", kw: "from address verify sender postal identity" },
];

type Wing = "transactional" | "marketing";

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
      aria-label="Search rootmail"
    >
      <Search className="size-3.5" /> Search
      <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
    </button>
  );
}

/** Global command palette: ⌘K / Ctrl+K (or the topbar button) to jump anywhere. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [wing, setWing] = useState<Wing>("transactional");
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

  // Context-aware: surface the wing the user is working in first (rm_wing cookie).
  useEffect(() => {
    const c = document.cookie.split("; ").find((x) => x.startsWith("rm_wing="))?.split("=")[1];
    if (c === "marketing" || c === "transactional") setWing(c);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // Wing-ordered destination groups.
  const wingGroups: [string, Item[]][] =
    wing === "marketing"
      ? [["Marketing", MK], ["Transactional", TX]]
      : [["Transactional", TX], ["Marketing", MK]];

  // Primary action follows the wing.
  const actions: Item[] =
    wing === "marketing"
      ? [
          { label: "New campaign", href: "/campaigns", kw: "broadcast send" },
          { label: "New sequence", href: "/sequences/new", kw: "automation" },
          { label: "Compose email", href: "/messages/new", kw: "new send write transactional" },
        ]
      : [
          { label: "Compose email", href: "/messages/new", kw: "new send write" },
          { label: "New template", href: "/templates/new", kw: "design studio" },
          { label: "New campaign", href: "/campaigns", kw: "broadcast" },
        ];
  actions.push(
    { label: "Verify a sending address", href: "/settings/sender", kw: "from domain sender setup verify" },
    { label: "Buy send blocks", href: "/billing/transactional", kw: "upgrade transactional volume overage" },
  );

  const renderGroup = (heading: string, items: Item[], icon: "go" | "action") => (
    <Command.Group key={heading} heading={heading} className={groupClass}>
      {items.map((it) => (
        <Command.Item key={`${heading}:${it.href}:${it.label}`} value={`${it.label} ${it.kw ?? ""}`} onSelect={() => go(it.href)} className={itemClass}>
          {icon === "go" ? (
            <ArrowRight className="size-3.5 text-muted-foreground" />
          ) : (
            <Plus className="size-3.5 text-muted-foreground" />
          )}
          {it.label}
        </Command.Item>
      ))}
    </Command.Group>
  );

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
      <Command.List className="max-h-96 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          No results.
        </Command.Empty>
        {renderGroup("Actions", actions, "action")}
        {renderGroup("Go to", SHARED, "go")}
        {wingGroups.map(([heading, items]) => renderGroup(heading, items, "go"))}
        {renderGroup("Workspace", WORKSPACE, "go")}
        {renderGroup("Settings", SETTINGS, "go")}
      </Command.List>
    </Command.Dialog>
  );
}
