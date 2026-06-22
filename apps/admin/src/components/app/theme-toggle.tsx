"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Light/dark toggle — flips the `dark` class on <html> and persists the choice.
 * Icons are CSS-driven so there's no hydration mismatch with the pre-paint script. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={() => {
        const isDark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("theme", isDark ? "dark" : "light");
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Moon className="size-[17px] dark:hidden" />
      <Sun className="hidden size-[17px] dark:block" />
    </button>
  );
}
