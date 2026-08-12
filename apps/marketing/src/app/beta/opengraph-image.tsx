import { ImageResponse } from "next/og";

// The social card for rootmail.io/beta. Generated rather than shipped as a PNG
// so the wording can never drift from the page it represents — and so there is
// no binary in the repo that someone has to re-export to fix a typo.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Join the rootmail beta";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0b0c",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "8px 18px",
            borderRadius: 999,
            border: "1px solid #3f3f46",
            color: "#a1a1aa",
            fontSize: 24,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Closed beta
        </div>
        <div style={{ marginTop: 36, fontSize: 82, fontWeight: 700, letterSpacing: -2 }}>
          Help us build rootmail
        </div>
        {/* Satori has no default `display: block` — any element with more than
            one child must say how it stacks, or the whole image fails to pipe.
            Hence two explicit rows instead of a <br>. */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            fontSize: 36,
            color: "#a1a1aa",
            lineHeight: 1.35,
          }}
        >
          <div>Receipts and newsletters are both just email.</div>
          <div>One roof, one audience, one reputation.</div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", fontSize: 30, color: "#71717a" }}>
          rootmail.io/beta
        </div>
      </div>
    ),
    { ...size },
  );
}
