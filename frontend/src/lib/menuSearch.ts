import type { MenuProduct, MenuSection } from "@/lib/menuGrouping";

// Lowercase and strip accents, so "jamon" finds "jamón" and "DISCADA" finds
// "Discada" (customers type fast on phones, often without accents).
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function searchableText(product: MenuProduct): string {
  const variantTexts = product.variants.flatMap((variant) => [variant.item.name, variant.item.description ?? ""]);
  return normalizeForSearch(
    [product.name, product.defaultItem.name, product.defaultItem.description ?? "", ...variantTexts].join(" "),
  );
}

// Client-side search across all categories. A Burrito/Montada pair is listed
// in two sections but appears once in the results.
export function searchProducts(sections: MenuSection[], query: string): MenuProduct[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  const seenGroups = new Set<string>();
  const results: MenuProduct[] = [];

  for (const section of sections) {
    for (const product of section.products) {
      if (seenGroups.has(product.groupKey)) continue;
      const text = searchableText(product);
      if (terms.every((term) => text.includes(term))) {
        seenGroups.add(product.groupKey);
        results.push(product);
      }
    }
  }
  return results;
}
