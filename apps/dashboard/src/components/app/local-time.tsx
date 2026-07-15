"use client";

// Renders a timestamp in the VIEWER's local timezone + locale. Server Components
// format with the server's clock (UTC in prod), which shows the wrong time to a
// user — so any user-facing absolute time should go through this instead.
export function LocalTime({
  iso,
  mode = "datetime",
}: {
  iso: string | null | undefined;
  mode?: "datetime" | "date" | "time";
}) {
  if (!iso) return <>—</>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <>—</>;
  const text =
    mode === "date"
      ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : mode === "time"
        ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  // The server render (its tz) is replaced by the client's local value on hydration.
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
