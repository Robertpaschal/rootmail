import { SubmitButton } from "@/components/app/submit-button";
import { LEAD_STATUS_LABEL } from "@/lib/leads";
import type { LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setLeadStatus } from "./actions";

// The positive sales path. "lost" is a side exit, handled below the bar.
const STAGES: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won"];

/** A clickable pipeline bar — filled up to the current stage, like a real CRM. */
export function LeadPipeline({ id, status }: { id: string; status: LeadStatus }) {
  const isLost = status === "lost";
  const isWon = status === "won";
  const currentIdx = STAGES.indexOf(status);

  return (
    <div className="space-y-3">
      <div className="flex items-stretch overflow-hidden rounded-lg border">
        {STAGES.map((s, i) => {
          const reached = !isLost && currentIdx >= i;
          const isCurrent = !isLost && currentIdx === i;
          const won = s === "won" && reached;
          return (
            <form key={s} action={setLeadStatus} className="flex-1">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                title={`Move to ${LEAD_STATUS_LABEL[s]}`}
                className={cn(
                  "flex h-10 w-full items-center justify-center border-r px-2 text-xs transition-colors last:border-r-0",
                  won
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : reached
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted",
                  isCurrent ? "font-semibold" : "font-medium",
                )}
              >
                {LEAD_STATUS_LABEL[s]}
              </button>
            </form>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {isLost
            ? "This lead is marked lost."
            : isWon
              ? "Won — converted to a customer. 🎉"
              : `Stage ${currentIdx + 1} of ${STAGES.length} · click ahead to advance`}
        </span>
        {isLost ? (
          <form action={setLeadStatus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="new" />
            <SubmitButton variant="outline" size="sm" pendingLabel="…">
              Reopen
            </SubmitButton>
          </form>
        ) : (
          <form action={setLeadStatus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="lost" />
            <SubmitButton
              variant="ghost"
              size="sm"
              pendingLabel="…"
              className="text-muted-foreground hover:text-destructive"
            >
              Mark lost
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
