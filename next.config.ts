import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vorschaubilder (i.ytimg.com) und Kanalbilder (yt3.ggpht.com) von YouTube.
    // Die Bilder werden mit `unoptimized` direkt vom YouTube-CDN geladen (spart Vercel-Kontingent).
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
};

export default nextConfig;
