/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/docs ships raw TS (the shared docs content) — Next must transpile it.
  transpilePackages: ["@rootmail/docs"],
};

export default nextConfig;
