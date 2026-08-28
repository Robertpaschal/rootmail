"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Monitor, Moon, Smartphone, Sun, Tablet, Type as TypeIcon } from "lucide-react";
import { fillTemplate, missingVariables, type PreviewPerson } from "@/lib/sample-vars";
import { cn } from "@/lib/utils";
import { EmailBodyFrame } from "@/components/app/email-body-frame";

const DEVICES = [
  { name: "Desktop", icon: Monitor, width: 720 },
  { name: "Tablet", icon: Tablet, width: 560 },
  { name: "Mobile", icon: Smartphone, width: 390 },
] as const;
type Device = (typeof DEVICES)[number]["name"];

/**
 * What the recipient actually gets.
 *
 * The old preview was a 420px iframe wedged into a sidebar showing raw
 * `{{name}}` braces — it told you almost nothing about the finished email. This
 * one is the whole point of the review stage: a real mail-client frame (from,
 * to, subject), sized to a real device, in the light or dark scheme the reader
 * will use, with the variables FILLED IN from the data we hold. Plus the
 * plain-text part, which is what a screen reader and a text-only client see.
 */
export function EmailPreview({
  html,
  text,
  subject,
  fromLabel,
  person,
  variables,
  people,
  onPickPerson,
  className,
}: {
  html: string;
  /** Plain-text alternative. Derived for you — shown so it can be checked. */
  text?: string;
  subject: string;
  /** "Acme <hello@acme.com>" — who it appears to come from. */
  fromLabel: string;
  /** Whose version of the email this is. */
  person: PreviewPerson;
  variables: Record<string, unknown>;
  /** Optional: other recipients to flip through (campaign review). */
  people?: PreviewPerson[];
  onPickPerson?: (p: PreviewPerson) => void;
  className?: string;
}) {
  const [device, setDevice] = useState<Device>("Desktop");
  const [dark, setDark] = useState(false);
  const [showText, setShowText] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const width = DEVICES.find((d) => d.name === device)?.width ?? 720;
  const filledSubject = useMemo(() => fillTemplate(subject, variables), [subject, variables]);
  const filledHtml = useMemo(() => fillTemplate(html, variables), [html, variables]);
  const filledText = useMemo(() => (text ? fillTemplate(text, variables) : ""), [text, variables]);
  const missing = useMemo(
    () => [...new Set([...missingVariables(subject, variables), ...missingVariables(html, variables)])],
    [subject, html, variables],
  );

  // The iframe carries its own reset so the email renders on its own terms —
  // none of the dashboard's CSS leaks in, exactly like a real mail client.
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:${dark ? "#111113" : "#ffffff"};color:${dark ? "#e8e8ea" : "#1a1a1a"};}
img{max-width:100%;height:auto}a{color:${dark ? "#8ab4ff" : "#2563eb"}}</style></head><body>${filledHtml}</body></html>`,
    [filledHtml, dark],
  );

  return (
    <div className={cn("space-y-3", className)}>
      {/* Controls: who it's for, on what, in which scheme. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {people && people.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-rule text-[9px] font-semibold text-ink-muted">
                  {(person.name ?? person.email)[0]?.toUpperCase()}
                </span>
                <span className="max-w-[16rem] truncate">Previewing as {person.name ?? person.email}</span>
                <ChevronDown className={cn("size-3.5 transition-transform", pickerOpen && "rotate-180")} />
              </button>
              <AnimatePresence>
                {pickerOpen ? (
                  <motion.ul
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 z-30 mt-1.5 max-h-72 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    {people.map((p) => (
                      <li key={p.email}>
                        <button
                          type="button"
                          onClick={() => {
                            onPickPerson?.(p);
                            setPickerOpen(false);
                          }}
                          className={cn(
                            "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                            p.email === person.email && "bg-accent/60",
                          )}
                        >
                          <span className="text-sm font-medium">{p.name ?? p.email}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{p.email}</span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Previewing as{" "}
              <span className="font-medium text-foreground">{person.name ?? person.email}</span>
              {person.real ? "" : " (a stand-in — your audience is empty)"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 rounded-md border p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => setDevice(d.name)}
                title={d.name}
                aria-pressed={device === d.name}
                className={cn(
                  "rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  device === d.name && "bg-secondary text-foreground",
                )}
              >
                <d.icon className="size-4" />
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setDark(false)}
              title="Light"
              aria-pressed={!dark}
              className={cn("rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground", !dark && "bg-secondary text-foreground")}
            >
              <Sun className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setDark(true)}
              title="Dark"
              aria-pressed={dark}
              className={cn("rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground", dark && "bg-secondary text-foreground")}
            >
              <Moon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            title="Plain-text version"
            aria-pressed={showText}
            className={cn(
              "rounded-md border p-1.5 text-muted-foreground transition-colors hover:text-foreground",
              showText && "bg-secondary text-foreground",
            )}
          >
            <TypeIcon className="size-4" />
          </button>
        </div>
      </div>

      {missing.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-acted/40 bg-acted/5 px-3 py-2 text-xs text-acted">
          <AlertTriangle className="size-3.5 shrink-0" />
          Still a placeholder at send time:
          {missing.map((v) => (
            <code key={v} className="rounded bg-acted/15 px-1 py-0.5 font-mono">{`{{${v}}}`}</code>
          ))}
          <span className="opacity-80">— pass it when you send, or replace it with real words.</span>
        </p>
      ) : null}

      {/* The mail-client frame. */}
      <div className="flex justify-center rounded-lg border bg-muted/40 p-4 sm:p-6">
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          style={{ width: `min(100%, ${width}px)` }}
          className={cn(
            "overflow-hidden rounded-lg border shadow-lg",
            dark ? "border-white/10 bg-[#111113]" : "border-black/10 bg-white",
          )}
        >
          <div className={cn("space-y-1 border-b px-4 py-3", dark ? "border-white/10" : "border-black/10")}>
            <p className={cn("text-sm font-semibold leading-snug", dark ? "text-white" : "text-black")}>
              {filledSubject || "(no subject)"}
            </p>
            <p className={cn("text-[11px]", dark ? "text-white/50" : "text-black/50")}>
              {fromLabel} → {person.email}
            </p>
          </div>
          {showText ? (
            <pre
              className={cn(
                "max-h-[560px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed",
                dark ? "text-white/80" : "text-black/80",
              )}
            >
              {filledText || "(no plain-text part)"}
            </pre>
          ) : (
            <EmailBodyFrame html={srcDoc} title="Email preview" className="bg-transparent" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
