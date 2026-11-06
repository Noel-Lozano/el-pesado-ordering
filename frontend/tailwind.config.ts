import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Matches the `prefers-color-scheme` block in globals.css. This is also
  // Tailwind's default, but stated explicitly so the dark: variant's
  // behavior is obvious without knowing the default.
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        // Set by next/font in layout.tsx; the variable already carries
        // Geist's own fallback stack.
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
