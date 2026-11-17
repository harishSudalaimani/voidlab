import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kiroku — Personal planner",
    short_name: "Kiroku",
    description: "Plan your days, keep study notes, and collect ideas for later.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#121612",
    theme_color: "#121612",
    icons: [
      { src: "/kiroku-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/kiroku-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Planner", short_name: "Planner", url: "/" },
    ],
  };
}
