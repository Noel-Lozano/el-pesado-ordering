import { MENU_CATEGORY } from "@/lib/menuCategories";

// Items in "Extras" that are drinks. menu_items has no drink flag (ADR-004
// Gaps), so this list has to be kept in sync with the menu by hand; an item
// missing from it just shows the burrito placeholder instead.
export const DRINK_NAMES: ReadonlySet<string> = new Set([
  "Agua",
  "Kool-Aid",
  "Té Brisk",
  "Refresco 355 ml",
  "Refresco 600 ml",
  "Fuze Tea",
  "Arizona",
  "Jugos",
]);

export const DRINK_PLACEHOLDER = "🥤";
export const FOOD_PLACEHOLDER = "🌯";

// Emoji shown on the yellow box while an item has no photo.
export function placeholderEmoji(itemName: string, categoryName: string): string {
  const isDrink = categoryName === MENU_CATEGORY.extras && DRINK_NAMES.has(itemName);
  return isDrink ? DRINK_PLACEHOLDER : FOOD_PLACEHOLDER;
}
