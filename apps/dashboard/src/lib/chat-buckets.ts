/**
 * Today / Yesterday / Previous 7 days / Older — the shape people already read
 * lists of conversations in.
 *
 * Shared because the assistant now lists its chats in two very different
 * places: the full page's wide rail, and the drawer/floating panel, which has
 * no room for a rail and turns itself into the list instead. Two surfaces, two
 * layouts, but "which day was that conversation?" has to answer the same way in
 * both or the same chat appears under different headings.
 */

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;
export type Bucket = (typeof BUCKET_ORDER)[number];

export function bucketOf(iso: string): Bucket {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "Older";
  const today = startOfDay(new Date());
  const day = startOfDay(t);
  const diff = Math.round((today - day) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff <= 7) return "Previous 7 days";
  return "Older";
}

/** Bucket a list, keeping input order within each bucket and dropping empties. */
export function groupByDay<T>(items: T[], at: (item: T) => string): { bucket: Bucket; items: T[] }[] {
  const by = new Map<Bucket, T[]>();
  for (const item of items) {
    const b = bucketOf(at(item));
    const list = by.get(b);
    if (list) list.push(item);
    else by.set(b, [item]);
  }
  return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ bucket: b, items: by.get(b)! }));
}
