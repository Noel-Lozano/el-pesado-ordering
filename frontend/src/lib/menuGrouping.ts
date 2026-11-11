import { MENU_CATEGORY } from "@/lib/menuCategories";
import type { MenuCategory, MenuItem } from "@/types/menu";

// The database stores a burrito and its montada as separate rows ("Asado" in
// Burritos at $45, "Asado" in Montadas at $65). The UI shows them as one
// product with a required "¿Cómo lo quieres?" choice. The pairing is derived
// from naming conventions, not stored (ADR-004 §3):
//   - Burritos "X" ↔ Montadas "X" (exact name)
//   - Después de las 2 PM "Burrito de X" ↔ "Montada de X" (exact X)
// A row whose partner is missing or named differently is a plain product.

export type VariantKind = "burrito" | "montada";

export interface MenuVariant {
  kind: VariantKind;
  item: MenuItem;
  // The concrete row's category; the cart stores it alongside the item id.
  categoryName: string;
}

export interface MenuProduct {
  // Unique per listing entry (a pair is listed in both Burritos and Montadas).
  key: string;
  // Same for every listing of the same pair; used to de-duplicate search hits.
  groupKey: string;
  // "Asado", or "Discada" for "Burrito de Discada" / "Montada de Discada".
  name: string;
  // The category this entry is listed under.
  categoryName: string;
  // The row preselected when the product is opened; its price is shown in lists.
  defaultItem: MenuItem;
  // The default item's real category (equals categoryName for every listing).
  defaultItemCategoryName: string;
  // [burrito, montada] for a pair; empty when there's no choice to make.
  variants: MenuVariant[];
}

export interface MenuSection {
  name: string;
  products: MenuProduct[];
}

const AFTER_TWO_PM_PREFIX: Record<VariantKind, string> = {
  burrito: "Burrito de ",
  montada: "Montada de ",
};

interface Pair {
  burrito: MenuVariant;
  montada: MenuVariant;
  name: string;
}

function itemsOf(categories: MenuCategory[], categoryName: string): MenuItem[] {
  return categories.find((category) => category.name === categoryName)?.items ?? [];
}

function pairKey(pair: Pair): string {
  return `pair-${pair.burrito.item.id}-${pair.montada.item.id}`;
}

// Burritos "X" ↔ Montadas "X".
function findBurritoMontadaPairs(categories: MenuCategory[]): Pair[] {
  const montadasByName = new Map(itemsOf(categories, MENU_CATEGORY.montadas).map((item) => [item.name, item]));
  const pairs: Pair[] = [];
  for (const burrito of itemsOf(categories, MENU_CATEGORY.burritos)) {
    const montada = montadasByName.get(burrito.name);
    if (montada) {
      pairs.push({
        name: burrito.name,
        burrito: { kind: "burrito", item: burrito, categoryName: MENU_CATEGORY.burritos },
        montada: { kind: "montada", item: montada, categoryName: MENU_CATEGORY.montadas },
      });
    }
  }
  return pairs;
}

// Después de las 2 PM "Burrito de X" ↔ "Montada de X".
function findAfterTwoPmPairs(categories: MenuCategory[]): Pair[] {
  const items = itemsOf(categories, MENU_CATEGORY.afterTwoPm);
  const montadasByFilling = new Map<string, MenuItem>();
  for (const item of items) {
    if (item.name.startsWith(AFTER_TWO_PM_PREFIX.montada)) {
      montadasByFilling.set(item.name.slice(AFTER_TWO_PM_PREFIX.montada.length), item);
    }
  }

  const pairs: Pair[] = [];
  for (const burrito of items) {
    if (!burrito.name.startsWith(AFTER_TWO_PM_PREFIX.burrito)) continue;
    const filling = burrito.name.slice(AFTER_TWO_PM_PREFIX.burrito.length);
    const montada = montadasByFilling.get(filling);
    if (filling && montada) {
      pairs.push({
        name: filling,
        burrito: { kind: "burrito", item: burrito, categoryName: MENU_CATEGORY.afterTwoPm },
        montada: { kind: "montada", item: montada, categoryName: MENU_CATEGORY.afterTwoPm },
      });
    }
  }
  return pairs;
}

export function groupMenuItems(categories: MenuCategory[]): MenuSection[] {
  const pairs = [...findBurritoMontadaPairs(categories), ...findAfterTwoPmPairs(categories)];
  const pairByItemId = new Map<number, Pair>();
  for (const pair of pairs) {
    pairByItemId.set(pair.burrito.item.id, pair);
    pairByItemId.set(pair.montada.item.id, pair);
  }

  return categories.map((category) => {
    const products: MenuProduct[] = [];
    for (const item of category.items) {
      const pair = pairByItemId.get(item.id);

      if (!pair) {
        products.push({
          key: `${category.name}-${item.id}`,
          groupKey: `item-${item.id}`,
          name: item.name,
          categoryName: category.name,
          defaultItem: item,
          defaultItemCategoryName: category.name,
          variants: [],
        });
        continue;
      }

      // Within "Después de las 2 PM" both halves share a category: list the
      // pair once, at the burrito's position, and skip the montada row.
      const isSameCategoryPair = pair.burrito.categoryName === pair.montada.categoryName;
      if (isSameCategoryPair && item.id === pair.montada.item.id) continue;

      // In Burritos the burrito is preselected; in Montadas, the montada.
      const preselected = item.id === pair.montada.item.id ? pair.montada : pair.burrito;
      products.push({
        key: `${category.name}-${item.id}`,
        groupKey: pairKey(pair),
        name: pair.name,
        categoryName: category.name,
        defaultItem: preselected.item,
        defaultItemCategoryName: preselected.categoryName,
        variants: [pair.burrito, pair.montada],
      });
    }
    return { name: category.name, products };
  });
}

export interface ProductSelection {
  product: MenuProduct;
  // The variant (or plain item) the URL pointed at.
  selectedItem: MenuItem;
  selectedItemCategoryName: string;
}

// For /item/[id]: the product containing this menu item, with that item
// preselected. Null if no listed product contains it.
export function findProductByItemId(sections: MenuSection[], itemId: number): ProductSelection | null {
  for (const section of sections) {
    for (const product of section.products) {
      const variant = product.variants.find((candidate) => candidate.item.id === itemId);
      if (variant) {
        return { product, selectedItem: variant.item, selectedItemCategoryName: variant.categoryName };
      }
      if (product.variants.length === 0 && product.defaultItem.id === itemId) {
        return { product, selectedItem: product.defaultItem, selectedItemCategoryName: product.categoryName };
      }
    }
  }
  return null;
}

// Every concrete menu row with its category, for cart re-validation.
export function listMenuItems(categories: MenuCategory[]): Array<{ item: MenuItem; categoryName: string }> {
  return categories.flatMap((category) => category.items.map((item) => ({ item, categoryName: category.name })));
}
