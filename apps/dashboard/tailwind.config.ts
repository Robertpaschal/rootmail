import type { Config } from "tailwindcss";
import { rootmailPreset } from "@rootmail/design/preset";

// The theme lives in the shared preset (packages/design/preset.ts) so the four
// apps cannot drift apart again — they already had, with different radii and
// status colours hardcoded to raw palette values with no dark-mode counterpart.
// Only genuinely dashboard-only additions belong below.
const config: Config = {
  presets: [rootmailPreset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/design/src/**/*.{ts,tsx}"],
};

export default config;
