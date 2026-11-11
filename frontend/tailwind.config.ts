import type { Config } from "tailwindcss";
import { colors, hardShadow, radii } from "./src/lib/designTokens";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // The design is light-only (ADR-004 §5), so there is no dark mode.
  theme: {
    // Replaced, not extended: only the brand palette is available, so a
    // stray `bg-zinc-100` or `text-red-700` fails to style and gets noticed.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      ...colors,
    },
    // Replaced, not extended: corners are 4px or 6px only, no pills.
    borderRadius: {
      none: "0",
      sm: radii.small,
      DEFAULT: radii.medium,
    },
    extend: {
      boxShadow: {
        hard: hardShadow,
      },
      fontFamily: {
        // Set by next/font in layout.tsx.
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
        display: ["var(--font-lilita-one)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
