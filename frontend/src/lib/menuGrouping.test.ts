import { describe, expect, it } from "vitest";
import { findProductByItemId, groupMenuItems } from "@/lib/menuGrouping";
import type { MenuCategory, MenuItem } from "@/types/menu";

function item(id: number, name: string, priceCents: number, availableFrom: string | null = null): MenuItem {
  return { id, name, description: `${name} desc`, priceCents, imageUrl: null, availableFrom };
}

const CATEGORIES: MenuCategory[] = [
  {
    name: "Burritos",
    items: [item(1, "Asado", 4500), item(2, "Frijoles con queso", 3000), item(3, "Solo burrito", 4000)],
  },
  {
    name: "Montadas",
    items: [item(10, "Asado", 6500), item(11, "Frijoles con queso", 5000), item(12, "Solo montada", 6000)],
  },
  { name: "Desayunos", items: [item(20, "Asado", 5500)] },
  {
    name: "Después de las 2 PM",
    items: [
      item(30, "Burrito de Discada", 6500, "14:00"),
      item(31, "Montada de Discada", 8000, "14:00"),
      item(32, "Burrito de Bistec", 6500, "14:00"),
      item(33, "Montada de bistec", 8000, "14:00"),
    ],
  },
  { name: "Extras", items: [item(40, "Agua", 1000)] },
];

function section(name: string) {
  const found = groupMenuItems(CATEGORIES).find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing section ${name}`);
  return found;
}

describe("groupMenuItems", () => {
  it("pairs Burritos and Montadas by exact name, preselecting the burrito", () => {
    const asado = section("Burritos").products[0];
    expect(asado.name).toBe("Asado");
    expect(asado.defaultItem.id).toBe(1);
    expect(asado.variants.map((variant) => [variant.kind, variant.item.id])).toEqual([
      ["burrito", 1],
      ["montada", 10],
    ]);
  });

  it("still lists paired montadas under Montadas, with the montada preselected", () => {
    const products = section("Montadas").products;
    expect(products.map((product) => product.name)).toEqual(["Asado", "Frijoles con queso", "Solo montada"]);
    expect(products[0].defaultItem.id).toBe(10);
    expect(products[0].variants).toHaveLength(2);
    expect(products[0].groupKey).toBe(section("Burritos").products[0].groupKey);
  });

  it("leaves unpaired items without a choice", () => {
    expect(section("Burritos").products[2].variants).toEqual([]);
    expect(section("Montadas").products[2].variants).toEqual([]);
    expect(section("Extras").products[0].variants).toEqual([]);
  });

  it("does not pair across other categories", () => {
    expect(section("Desayunos").products[0].variants).toEqual([]);
  });

  it("pairs 'Burrito de X' with 'Montada de X' after 2 PM, listed once", () => {
    const products = section("Después de las 2 PM").products;
    const discada = products.find((product) => product.name === "Discada");
    expect(discada?.defaultItem.id).toBe(30);
    expect(discada?.variants.map((variant) => variant.item.id)).toEqual([30, 31]);
    expect(products.some((product) => product.defaultItem.id === 31)).toBe(false);
  });

  it("does not pair when the filling differs in case", () => {
    const names = section("Después de las 2 PM").products.map((product) => product.name);
    expect(names).toEqual(["Discada", "Burrito de Bistec", "Montada de bistec"]);
  });

  it("keeps the API's item order within each category", () => {
    expect(section("Burritos").products.map((product) => product.defaultItem.id)).toEqual([1, 2, 3]);
  });
});

describe("findProductByItemId", () => {
  const sections = groupMenuItems(CATEGORIES);

  it("finds a pair by either variant and preselects that variant", () => {
    expect(findProductByItemId(sections, 1)?.selectedItem.id).toBe(1);
    const montada = findProductByItemId(sections, 10);
    expect(montada?.selectedItem.id).toBe(10);
    expect(montada?.selectedItemCategoryName).toBe("Montadas");
    expect(montada?.product.variants).toHaveLength(2);
  });

  it("finds the after-2 PM montada even though it isn't listed on its own", () => {
    expect(findProductByItemId(sections, 31)?.product.name).toBe("Discada");
  });

  it("finds plain items and returns null for unknown ids", () => {
    expect(findProductByItemId(sections, 40)?.selectedItemCategoryName).toBe("Extras");
    expect(findProductByItemId(sections, 999)).toBeNull();
  });
});
