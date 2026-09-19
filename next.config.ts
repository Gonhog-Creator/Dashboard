import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cache dynamic RSC payloads client-side for 30s so back/forward and
    // repeat navigations between dashboard pages are instant.
    staleTimes: { dynamic: 30 },
  },
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "alasky.cds.unistra.fr" },
    ],
  },
};

export default nextConfig;
