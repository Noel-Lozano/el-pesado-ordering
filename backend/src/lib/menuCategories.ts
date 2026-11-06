// Menu categories in the order they appear on the menu board. This is the
// single source of truth for category order: the seed script writes these
// names into menu_items.category, and GET /menu sorts by position in this list
// (display_order only orders items *within* a category).
export const MENU_CATEGORY_ORDER = [
  "Burritos",
  "Montadas",
  "Desayunos",
  "Después de las 2 PM",
  "Extras",
] as const;

export type MenuCategory = (typeof MENU_CATEGORY_ORDER)[number];
