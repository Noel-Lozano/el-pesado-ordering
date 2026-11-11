import { describe, expect, it } from "vitest";
import { groupMenuItems } from "@/lib/menuGrouping";
import { normalizeForSearch, searchProducts } from "@/lib/menuSearch";
import type { MenuItem } from "@/types/menu";

function item(id: number, name: string, description: string): MenuItem {
  return { id, name, description, priceCents: 4000, imageUrl: null, availableFrom: null };
}

const SECTIONS = groupMenuItems([
  { name: "Burritos", items: [item(1, "Asado", "Puerco en chile colorado"), item(2, "Huevo con jamón", "Desayuno")] },
  { name: "Montadas", items: [item(10, "Asado", "Con queso gratinado")] },
  { name: "Extras", items: [item(40, "Agua", "Bien fría")] },
]);

describe("normalizeForSearch", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeForSearch("  Jamón FRÍA ")).toBe("jamon fria");
  });
});

describe("searchProducts", () => {
  it("ignores accents and case", () => {
    expect(searchProducts(SECTIONS, "JAMON").map((product) => product.name)).toEqual(["Huevo con jamón"]);
  });

  it("matches descriptions, including a variant's description", () => {
    expect(searchProducts(SECTIONS, "fria").map((product) => product.name)).toEqual(["Agua"]);
    expect(searchProducts(SECTIONS, "gratinado").map((product) => product.name)).toEqual(["Asado"]);
  });

  it("lists a Burrito/Montada pair once", () => {
    expect(searchProducts(SECTIONS, "asado")).toHaveLength(1);
  });

  it("requires every word to match", () => {
    expect(searchProducts(SECTIONS, "asado chile").map((product) => product.name)).toEqual(["Asado"]);
    expect(searchProducts(SECTIONS, "asado agua")).toEqual([]);
  });

  it("returns everything, once per product, for an empty query", () => {
    expect(searchProducts(SECTIONS, "  ")).toHaveLength(3);
  });
});
