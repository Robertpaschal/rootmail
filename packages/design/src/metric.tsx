import { cx } from "./cx";

/**
 * THE SOURCING LINE — see `docs/design/00-PHILOSOPHY.md` §5.3.
 *
 * Every number ships with the window it covers and the method that produced
 * it. "1,204 sent" is not a number; "1,204 sent · 30d · api+worker" is.
 *
 * The enforcement is in the TYPES, deliberately: `window` and `method` are
 * required, so a naked metric cannot be constructed without someone editing
 * this file and noticing why they shouldn't. That is the cheapest available
 * mechanism for a rule that is otherwise forgotten under deadline.
 *
 * `inferred` marks a number we did not observe — an open rate is a tracking
 * pixel firing, and mail clients prefetch images. It renders in the hollow
 * treatment that matches the line's inferred station, and it REQUIRES a
 * caveat naming the bias, because an inference presented in the same weight
 * as an observation is the industry's founding lie.
 */

type Base = {
  value: string | number;
  /** What is being counted, lowercase: "sent", "complaints", "delivered". */
  label: string;
  /** The window the number covers: "30d", "24h", "all time", "this period". */
  window: string;
  /** Where it came from: "provider feedback", "api+worker", "tracking pixel". */
  method: string;
  /** A threshold or comparison worth printing beside it: "warn at 0.1%". */
  threshold?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

type Observed = Base & { inferred?: false; caveat?: string };
type Inferred = Base & {
  inferred: true;
  /** Required for inferred numbers: name the bias. */
  caveat: string;
};

export type MetricProps = Observed | Inferred;

/* Figures are set in the DISPLAY face, not the mono and not the UI sans.
   Measured against the references: the big number on a page belongs in the
   display face at size — that is what makes it legible AND what makes it carry
   the identity. Mono digits at these sizes read as code and scan slowly. */
const SIZE = {
  sm: "text-2xl",
  md: "text-[2.125rem]",
  lg: "text-5xl",
} as const;

export function Metric(props: MetricProps) {
  const { value, label, window, method, threshold, className, size = "md" } = props;
  const inferred = props.inferred === true;
  const caveat = props.caveat;

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span
        className={cx(
          "display-num font-semibold leading-none",
          SIZE[size],
          // An inferred number is never drawn at full ink. It is a guess, and
          // it should look like one next to a number we can stand behind.
          inferred && "text-ink-muted",
        )}
        data-fact
      >
        {value}
      </span>
      <span className="font-mono text-[11px] leading-snug text-muted-foreground">
        <span className="text-foreground/70">{label}</span>
        {" · "}
        {window}
        {" · "}
        {method}
        {threshold ? <> {" · "}{threshold}</> : null}
        {caveat ? (
          <>
            {" · "}
            <span className={cx(inferred && "text-acted")}>{caveat}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A recorded value in running text — an id, an address, a domain, a
 * timestamp, a threshold. Mono here is not "this is code"; it is the
 * typographic marker for "this is a value we recorded, not prose we wrote".
 */
export function Fact({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("font-mono text-[0.9em] tabular-nums", className)} data-fact>
      {children}
    </span>
  );
}
