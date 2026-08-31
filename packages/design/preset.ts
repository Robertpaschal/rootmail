import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * The shared rootmail Tailwind preset.
 *
 * Every app extends this instead of redeclaring the same theme. Before this
 * existed the four apps each kept a private copy and had already drifted —
 * different radii, different keyframes, and status colours hardcoded to raw
 * palette values that had no dark-mode counterpart.
 *
 * Pair it with `@rootmail/design/tokens.css`, which defines the variables
 * these colours point at. The preset without the tokens is a theme of
 * undefined values.
 */
export const rootmailPreset = {
  darkMode: ["class"],
  content: [],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1200px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        /* Headlines and figures. Pair with `font-variation-settings` via the
           `.display` / `.display-num` utilities so the Fraunces axes apply. */
        display: ["var(--font-display)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        /* The semantic layer. Reach for these, not for `emerald-600`.
           Each has a `tint` that is theme-aware — which the raw palette
           values are not, and that is why 120 status chips currently break
           in dark mode. */
        ink: { DEFAULT: "hsl(var(--ink))", muted: "hsl(var(--ink-muted))" },
        /* Brass is the one accent, and it means "you can act on this".
           `brass-text` is the darker cut that passes AA on a light ground. */
        brass: {
          DEFAULT: "hsl(var(--brass))",
          text: "hsl(var(--brass-text))",
          ink: "hsl(var(--brass-ink))",
        },
        paper: { DEFAULT: "hsl(var(--paper))", raised: "hsl(var(--paper-raised))" },
        rule: "hsl(var(--rule))",
        /* A recessed plane for panels that sit inside a section. */
        well: "hsl(var(--well))",
        /* Code and app previews: a quotation, so it contrasts with the page
           rather than tinting it. Dark in both themes on purpose. */
        code: { DEFAULT: "hsl(var(--code-bg))", fg: "hsl(var(--code-fg))", ring: "hsl(var(--code-ring))" },
        witnessed: { DEFAULT: "hsl(var(--witnessed))", tint: "hsl(var(--witnessed-tint))" },
        acted: { DEFAULT: "hsl(var(--acted))", tint: "hsl(var(--acted-tint))" },
        stopped: { DEFAULT: "hsl(var(--stopped))", tint: "hsl(var(--stopped-tint))" },
      },
      letterSpacing: {
        display: "var(--track-display)",
        heading: "var(--track-heading)",
        body: "var(--track-body)",
      },
      lineHeight: {
        // Display leading at or below 1.0 is the single most reliable tell
        // separating an authored page from a generic one — measured across
        // every reference in docs/design/01-REFERENCES.md. The one that reads
        // corporate is the only one above it.
        display: "0.95",
        tight: "1.0",
      },
      transitionTimingFunction: {
        interaction: "var(--ease-interaction)",
        narrative: "var(--ease-narrative)",
      },
      transitionDuration: {
        interaction: "100ms",
        narrative: "700ms",
      },
      borderRadius: {
        /* DEFAULT matters: bare `rounded` is used widely and, left unset, keeps
           Tailwind's stock 0.25rem — which is exactly the square corner this
           system moved away from. It follows the scale now. */
        DEFAULT: "calc(var(--radius) - 0.3125rem)",
        /* A scale, not one bubble radius — a dense table and a marketing hero
           want different amounts of curve. `--radius` is 1rem; app surfaces sit
           at lg/md, marketing panels reach for xl/2xl. */
        sm: "calc(var(--radius) - 0.375rem)",
        md: "calc(var(--radius) - 0.1875rem)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 0.25rem)",
        "2xl": "calc(var(--radius) + 0.625rem)",
        "3xl": "calc(var(--radius) + 1rem)",
      },
      boxShadow: {
        /* Depth is a token now. On a dark ground these lead with an inset
           highlight and a far brass glow, because a drop shadow is invisible
           there; on light they are real shadows. Both live in tokens.css. */
        e1: "var(--elev-1)",
        e2: "var(--elev-2)",
        e3: "var(--elev-3)",
        /* Pressed in, not lifted out — inset shadow plus a ring. */
        well: "var(--elev-well)",
        ring: "0 0 0 1px hsl(var(--rule))",
        knockout: "0 0 0 8px hsl(var(--background))",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /* Ambient life only. Every keyframe here animates a decorative
           property on an element ALREADY at its resting, readable state —
           never opacity 0 → 1, never width 0 → n. The preview pane and any
           background tab suspend animation, and content that needs an
           animation to finish before it can be read is content that
           sometimes cannot be read at all. */
        sweep: { from: { transform: "translateX(-130%)" }, to: { transform: "translateX(230%)" } },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
        /* Like blink, but never reaches zero — for anything where the dot
           ITSELF is the content, e.g. a typing indicator. */
        throb: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        timer: { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        /* The line's in-flight segment: a dash pattern that travels along an
           already-drawn stroke. The stroke is fully visible with the
           animation suspended; only the dashes move. */
        "line-travel": { from: { strokeDashoffset: "12" }, to: { strokeDashoffset: "0" } },
        /* Page entrance. TRANSFORM ONLY — no opacity — so a page that never
           gets a frame is eight pixels low rather than invisible. */
        "fade-rise": { from: { transform: "translateY(8px)" }, to: { transform: "translateY(0)" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        sweep: "sweep 2.4s ease-in-out infinite",
        blink: "blink 1.1s step-end infinite",
        throb: "throb 1.4s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        timer: "timer 7s linear forwards",
        "line-travel": "line-travel 1s linear infinite",
        "fade-rise": "fade-rise 0.7s var(--ease-narrative) both",
      },
    },
  },
  plugins: [animate],
} satisfies Config;

export default rootmailPreset;
