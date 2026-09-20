import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/docs ships raw TS (the shared docs content) — Next must transpile it.
  transpilePackages: ["@rootmail/docs", "@rootmail/design"],
};

export default nextConfig;
