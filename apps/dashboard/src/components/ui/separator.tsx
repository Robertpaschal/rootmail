import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      className={cn(
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        "shrink-0 bg-border",
        className,
      )}
    />
  );
}
