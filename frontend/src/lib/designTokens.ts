// Design tokens from design/README.md. This is the only place brand hex values
// live: tailwind.config.ts builds the theme from it, and non-Tailwind places
// (web manifest, browser theme-color) import it directly. Components use the
// Tailwind names (bg-navy, text-muted, shadow-hard…), never raw hex.

export const colors = {
  // Text, 2px borders, header, tab bar.
  navy: "#1B2A5C",
  // Primary actions. Always navy text on orange (white on orange fails 4.5:1).
  orange: "#F08A24",
  // Title, selected states, image placeholders.
  yellow: "#FFD23F",
  // Title outline, "Requerido" and other badges (white text).
  red: "#C62A1E",
  white: "#FFFFFF",
  // Subtle fills: selected option, inputs, notes.
  paper: "#FFF8F2",
  // Secondary text.
  muted: "#5A4636",
  // List dividers.
  line: "#E9C9AE",
  // Only behind the logo.
  cream: "#FCE6D4",
  // Borders of disabled / not-yet-done controls (used in the mockups, not in
  // the README table).
  disabled: "#8A7A6E",
} as const;

export const radii = {
  // Small controls and chips.
  small: "4px",
  // Cards and buttons.
  medium: "6px",
} as const;

// Hard offset shadow on primary buttons and featured cards.
export const hardShadow = `3px 3px 0 ${colors.navy}`;
