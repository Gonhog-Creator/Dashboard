import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "alasky.cds.unistra.fr" },
    ],
  },
};

export default nextConfig;
