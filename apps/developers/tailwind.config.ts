import type { Config } from "tailwindcss";
import { rootmailPreset } from "@rootmail/design/preset";

const config: Config = {
  presets: [rootmailPreset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/design/src/**/*.{ts,tsx}"],
};

export default config;
