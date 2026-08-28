import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * WHERE THE MAIL WENT, AS ONE BAR.
 *
 * Six numbers in six bordered boxes is a composition rendered as a list: the
 * reader has to do the division themselves to learn the only thing the section
 * is for, which is what share of the sending ended badly. A single proportional
 * bar states the share by construction, and the counts hang off it as a legend
 * that is also the navigation — each band is the filter that shows you those
 * messages.
 *
 * The rendering law applies: `delivered` is a provider confirmation and gets
 * the witnessed colour; the three bad outcomes are `stopped`; in-flight is not
 * an outcome at all yet, so it is drawn as ink at low opacity rather than
 * borrowing a signal colour it has not earned.
 */
export function VolumeBar({
  volume,
  windowDays,
}: {
  volume: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
    in_flight: number;
  };
  windowDays: number;
}) {
  const bands = [
    {
      key: "delivered",
      label: "delivered",
      value: volume.delivered,
      bar: "bg-witnessed",
      text: "text-witnessed",
      href: "/messages?status=delivered",
      method: "provider confirmation",
    },
    {
      key: "bounced",
      label: "bounced",
      value: volume.bounced,
      bar: "bg-stopped",
      text: "text-stopped",
      href: "/messages?status=bounced",
      method: "provider feedback",
    },
    {
      key: "complained",
      label: "marked spam",
      value: volume.complained,
      bar: "bg-stopped/70",
      text: "text-stopped",
      href: "/messages?status=complained",
      method: "provider feedback",
    },
    {
      key: "failed",
      label: "failed to send",
      value: volume.failed,
      bar: "bg-stopped/40",
      text: "text-stopped",
      href: "/messages?status=failed",
      method: "our send pipeline",
    },
    {
      key: "in_flight",
      label: "still in flight",
      value: volume.in_flight,
      bar: "bg-ink/20",
      text: "text-muted-foreground",
      href: "/messages?status=sent",
      method: "no outcome yet",
    },
  ].filter((b) => b.value > 0);

  const total = Math.max(1, bands.reduce((n, b) => n + b.value, 0));

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {bands.map((b) => (
          <span
            key={b.key}
            className={cn("h-full", b.bar)}
            style={{ width: `${(b.value / total) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-rule border-t border-rule">
        {bands.map((b) => (
          <li key={b.key}>
            <Link
              href={b.href}
              className="-mx-2 flex items-baseline gap-3 rounded-md px-2 py-2 transition-colors duration-interaction ease-interaction hover:bg-secondary/50"
            >
              <span aria-hidden className={cn("size-2 shrink-0 translate-y-[-1px] rounded-full", b.bar)} />
              <span className="text-sm">{b.label}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground" data-fact>
                {((b.value / total) * 100).toFixed(1)}% · {windowDays}d · {b.method}
              </span>
              <span className={cn("display-num w-16 shrink-0 text-right text-base", b.text)}>
                {b.value.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
