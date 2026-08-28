/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/design ships raw TS (tokens, preset, the line) — Next must transpile it.
  transpilePackages: ["@rootmail/design"],
};

export default nextConfig;
