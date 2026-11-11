import type { MetadataRoute } from "next";
import { strings } from "@/lib/strings";
import { BRAND_COLOR, PAGE_BACKGROUND_COLOR } from "@/lib/theme";

// Web app manifest: lets customers "Add to Home Screen" and open the app
// full-screen like a native app (architecture.md §2: PWA, no native apps).
// Icons in public/icons/ are PLACEHOLDERS until the real logo is provided.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.app.name,
    short_name: strings.app.shortName,
    description: strings.app.description,
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PAGE_BACKGROUND_COLOR,
    theme_color: BRAND_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
