"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, KeyRound, Megaphone, Plus, Send, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

// The actions people reach for most, one click from anywhere — no hunting
// through sections. Complements ⌘K (search) with a mouse-first path.
const ACTIONS = [
  { href: "/messages/new", label: "Send an email", hint: "Transactional", icon: Send },
  { href: "/campaigns/new", label: "New campaign", hint: "Marketing", icon: Megaphone },
  { href: "/templates/new", label: "New template", hint: "Design studio", icon: FileText },
  { href: "/contacts?add=import", label: "Import contacts", hint: "CSV or paste", icon: Upload },
  { href: "/members", label: "Invite a teammate", hint: "Team", icon: Users },
  { href: "/api-keys", label: "Create an API key", hint: "Developers", icon: KeyRound },
];

export function QuickCreate() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Click-away + Escape both dismiss.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="static shrink-0 sm:relative">
      <Button
        ref={triggerRef}
        size="sm"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Create new"
        className="topbar-control topbar-create"
      >
        <Plus className={`size-4 transition-transform ${open ? "rotate-45" : ""}`} />
        <span className="hidden xl:inline">New</span>
      </Button>
        {open ? (
          <div
            className="ui-menu-enter absolute left-4 right-4 top-full z-50 mt-2 w-auto overflow-hidden rounded-lg border bg-popover p-1.5 shadow-lg sm:left-0 sm:right-auto sm:w-64"
            role="menu"
          >
            {ACTIONS.map((a) => (
              <div key={a.href}>
                <Link
                  href={a.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                    <a.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{a.hint}</span>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        ) : null}
    </div>
  );
}
