/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @rootmail/docs ships raw TS (the shared docs content) — Next must transpile it.
  // @rootmail/core is here for ONE leaf subpath, `@rootmail/core/email-motion`,
  // which the studio serializer needs on the client. Import only leaf subpaths
  // that are dependency-free; the package root pulls in env, Redis and BullMQ.
  transpilePackages: ["@rootmail/docs", "@rootmail/core", "@rootmail/design"],
  experimental: {
    // Avatar uploads pass through a Server Action (browser → action → API). The
    // default Server Action body limit is 1MB; bump it so a ~2MB image fits.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
