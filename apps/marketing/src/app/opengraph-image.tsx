import { ImageResponse } from "next/og";

/**
 * The card people see when rootmail.io is pasted into a chat or a post.
 *
 * There wasn't one. `openGraph` declared a title and a description and no
 * image, and `twitter.card` was `summary_large_image` with no large image to
 * show — so every share rendered as bare grey text, which is the one surface
 * that reaches people who have never been to the site.
 *
 * It is generated rather than shipped as a PNG so the wording cannot drift from
 * the page it represents, and so nobody has to re-export a binary to fix a typo.
 *
 * The card is the product's own argument rather than a logo on a colour: the
 * line, with `Opened` drawn hollow. Somebody who sees this in a feed and never
 * clicks has still been told the one thing that makes us different from every
 * other sender — we draw the difference between what we witnessed and what we
 * guessed. Brass appears once, on the mark, because on this canvas there is
 * nothing to press.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "rootmail — send your business's email, and know what happened to every one";

const PAPER = "#191410";
const INK = "#F3ECE2";
const MUTED = "#A79A8C";
const BRASS = "#E1A847";
const WITNESSED = "#74B585";
const DIM = "#4A3D2F";

/** Queued, Sent, Delivered are witnessed; Opened is inferred; Clicked unknown. */
const STATIONS = [
  { label: "Queued", state: "witnessed" },
  { label: "Sent", state: "witnessed" },
  { label: "Delivered", state: "witnessed" },
  { label: "Opened", state: "inferred" },
  { label: "Clicked", state: "unknown" },
] as const;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: PAPER,
          color: INK,
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: BRASS,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 26, fontFamily: "sans-serif", letterSpacing: -0.4 }}>
            rootmail
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ fontSize: 66, lineHeight: 1.04, letterSpacing: -1.8, maxWidth: 940 }}>
            {"Send your business's email, and know what happened to every one."}
          </div>

          {/* The line. Solid to Delivered, hollow at Opened, dotted after. */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {STATIONS.map((s, i) => (
              <div
                key={s.label}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 168 }}
              >
                <div style={{ display: "flex", alignItems: "center", width: "100%", height: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      flex: 1,
                      height: 3,
                      background: i === 0 ? "transparent" : s.state === "unknown" ? DIM : WITNESSED,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      width: 17,
                      height: 17,
                      borderRadius: 999,
                      // Hollow means inferred: the ground shows through a ring.
                      background:
                        s.state === "witnessed" ? WITNESSED : s.state === "unknown" ? DIM : PAPER,
                      border: s.state === "inferred" ? `3px solid ${INK}` : "none",
                    }}
                  />
                  <div style={{ display: "flex", flex: 1, height: 3, background: "transparent" }} />
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 19,
                    fontFamily: "sans-serif",
                    color: s.state === "witnessed" ? INK : MUTED,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 21, fontFamily: "sans-serif", color: MUTED }}>
          A filled station is one we witnessed. A hollow one we inferred.
        </div>
      </div>
    ),
    size,
  );
}
