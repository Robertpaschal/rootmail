import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Ambient life. Every one of these animates a decorative property on
        // an element that is ALREADY at its resting, readable state — never
        // opacity 0 → 1 or width 0 → n. The preview pane (and any background
        // tab) suspends animation, and content that needs an animation to
        // finish before it can be read is content that sometimes can't be.
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(5%,-4%,0) scale(1.15)" },
        },
        sweep: {
          from: { transform: "translateX(-130%)" },
          to: { transform: "translateX(230%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.5)" },
          "70%, 100%": { boxShadow: "0 0 0 14px hsl(var(--primary) / 0)" },
        },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
        // Like `blink`, but it never reaches zero. For anything where the dot
        // ITSELF is the content (a typing indicator): staggered `blink` dots
        // sat at opacity 0 wherever animation is suspended, so two thirds of
        // the indicator simply wasn't there.
        throb: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        // The carousel's "time until the next slide" bar.
        timer: { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        aurora: "aurora 18s ease-in-out infinite",
        sweep: "sweep 2.4s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        blink: "blink 1.1s step-end infinite",
        throb: "throb 1.4s ease-in-out infinite",
        bob: "bob 3.5s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        // Duration is overridden inline per carousel; declared here so Tailwind
        // actually emits the @keyframes.
        timer: "timer 7s linear forwards",
      },
    },
  },
  plugins: [animate],
};

export default config;
