// Category names exactly as stored in menu_items.category and returned by
// GET /menu (mirrors backend/src/lib/menuCategories.ts). The frontend keys
// behavior off a few of them: variant pairing and the drink placeholder.
export const MENU_CATEGORY = {
  burritos: "Burritos",
  montadas: "Montadas",
  breakfast: "Desayunos",
  afterTwoPm: "Después de las 2 PM",
  extras: "Extras",
} as const;
