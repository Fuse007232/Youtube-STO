import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vorschaubilder von YouTube (ab Phase 2)
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
};

export default nextConfig;
