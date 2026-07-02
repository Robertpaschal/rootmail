/** draft/published pill shared by the content list and both editors. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        status === "published"
          ? "rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-600"
          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}
