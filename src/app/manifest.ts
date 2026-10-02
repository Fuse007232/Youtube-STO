import type { MetadataRoute } from "next";

/** Web-App-Manifest: „Zum Startbildschirm hinzufügen“ öffnet das Dashboard wie eine App. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shorts Live Timing",
    short_name: "Live Timing",
    description: "Privates Dashboard für Bra1nrotvault und Granny Aura",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080b",
    theme_color: "#08080b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
