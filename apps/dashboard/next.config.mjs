/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/docs ships raw TS (the shared docs content) — Next must transpile it.
  transpilePackages: ["@rootmail/docs"],
  experimental: {
    // Avatar uploads pass through a Server Action (browser → action → API). The
    // default Server Action body limit is 1MB; bump it so a ~2MB image fits.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
