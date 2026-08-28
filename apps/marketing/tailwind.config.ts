import type { Config } from "tailwindcss";
import { rootmailPreset } from "@rootmail/design/preset";

// The theme lives in the shared preset (packages/design/preset.ts). Marketing
// keeps only what is genuinely marketing-only: the two keyframes the product
// tour uses. The `aurora` keyframe went with the hero glows it existed for.
const config: Config = {
  presets: [rootmailPreset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/design/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--ink) / 0.35)" },
          "70%, 100%": { boxShadow: "0 0 0 14px hsl(var(--ink) / 0)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        bob: "bob 3.5s ease-in-out infinite",
      },
    },
  },
};

export default config;
