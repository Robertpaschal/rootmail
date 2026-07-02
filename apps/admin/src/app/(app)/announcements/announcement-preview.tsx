import { Fragment } from "react";

/** Renders an announcement the way `announcementEmail()` lays it out — greeting,
 * paragraphs, team sign-off, recipient footer — so staff see the actual email,
 * both while composing and in the archive. */
export function AnnouncementPreview({ body }: { body: string }) {
  const paragraphs = body.trim().length ? body.trim().split(/\n{2,}/) : [];
  return (
    <div className="rounded-lg border bg-card p-5 text-sm leading-relaxed">
      <p>Hi Jane,</p>
      {paragraphs.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Your message appears here as you write…</p>
      ) : (
        paragraphs.map((p, i) => (
          <p key={i} className="mt-3">
            {p.split("\n").map((line, j, arr) => (
              <Fragment key={j}>
                {line}
                {j < arr.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        ))
      )}
      <p className="mt-5 text-[13px] text-muted-foreground">— The rootmail team</p>
      <p className="mt-2 text-xs text-muted-foreground/70">
        You&apos;re receiving this because you own a rootmail account. ·{" "}
        <span className="underline">Unsubscribe from announcements</span>
      </p>
    </div>
  );
}
