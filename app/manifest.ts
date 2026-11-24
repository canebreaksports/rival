import type { MetadataRoute } from "next";
// "Add to Home Screen": PITTED opens full screen like an app (owner, Nov 2026: keep players coming back).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PITTED", short_name: "PITTED", description: "Your school vs. theirs. Every game week.",
    start_url: "/", display: "standalone", background_color: "#0b1410", theme_color: "#0b1410",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
}
