import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/design ships raw TS (tokens, preset, the line) — Next must transpile it.
  transpilePackages: ["@rootmail/design"],
};

export default nextConfig;
