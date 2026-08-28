import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ContactStatusBadge } from "@/components/app/status-badge";
import { relativeTime } from "@/lib/format";
import { STAGE_META } from "@/lib/stages";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * PEOPLE, NOT ROWS.
 *
 * This was six columns — email, name, status, stage, tags, added — which is the
 * same object as the messages table and the templates table, applied to the one
 * dataset in the product that is made of human beings. It also had the priority
 * exactly backwards: the address led and the person's NAME sat in the second
 * column, greyed, showing an em-dash for everyone we only have an address for.
 *
 * A roster leads with identity. The monogram and the name come first; the
 * address is the mono line underneath, where an identifier belongs. Stage is a
 * position on a path, so it is drawn as one — the ink ramp from `STAGE_META`,
 * with the person's own step filled — rather than as one more coloured chip in
 * a column of coloured chips.
 *
 * `at_risk` is deliberately NOT drawn on the path. It is a side lane in the
 * data model and drawing it as "step five" would assert a progression that the
 * product does not believe in.
 */

const PATH = ["subscriber", "engaged", "customer", "champion"] as const;

/** Two letters off the name, or one off the address. No avatars: we have never
 *  seen these people, and a generated face would be a picture of a claim. */
function monogram(c: Contact): string {
  const source = c.name?.trim() || c.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function StagePath({ stage }: { stage: Contact["stage"] }) {
  const meta = STAGE_META[stage];
  if (stage === "at_risk") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden className="h-px w-9 border-t border-dashed border-rule" />
        {meta.label}
      </span>
    );
  }
  const at = PATH.indexOf(stage as (typeof PATH)[number]);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={meta.hint}>
      <span aria-hidden className="flex items-center gap-[3px]">
        {PATH.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 rounded-full",
              i === at ? "w-4" : "w-1.5",
              i <= at ? STAGE_META[PATH[at]].dot : "bg-ink/10",
            )}
          />
        ))}
      </span>
      {meta.label}
    </span>
  );
}

export function PeopleRoster({ people }: { people: Contact[] }) {
  return (
    <ul className="border-t border-rule">
      {people.map((c) => (
        <li key={c.id} className="border-b border-rule">
          <Link
            href={`/contacts/${c.id}`}
            className="-mx-3 flex items-start gap-4 rounded-lg px-3 py-3.5 transition-colors duration-interaction ease-interaction hover:bg-secondary/40"
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-rule bg-secondary/60 text-[11px] font-medium text-ink-muted"
            >
              {monogram(c)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="truncate font-medium tracking-heading">
                  {c.name?.trim() || c.email}
                </span>
                {c.status !== "active" ? <ContactStatusBadge status={c.status} /> : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {c.name?.trim() ? (
                  <span className="truncate font-mono text-xs text-muted-foreground" data-fact>
                    {c.email}
                  </span>
                ) : null}
                <StagePath stage={c.stage} />
              </span>
              {c.tags.length ? (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {c.tags.slice(0, 6).map((t) => (
                    <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                      {t}
                    </Badge>
                  ))}
                  {c.tags.length > 6 ? (
                    <span className="self-center font-mono text-[10px] text-muted-foreground">
                      +{c.tags.length - 6}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>

            <span
              className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-[11px] text-muted-foreground"
              data-fact
            >
              added {relativeTime(c.created_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
