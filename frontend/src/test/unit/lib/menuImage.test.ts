import { describe, expect, it } from "vitest";
import { DRINK_PLACEHOLDER, FOOD_PLACEHOLDER, placeholderEmoji } from "@/lib/menuImage";

describe("placeholderEmoji", () => {
  it("uses the drink emoji for listed drinks in Extras", () => {
    expect(placeholderEmoji("Agua", "Extras")).toBe(DRINK_PLACEHOLDER);
    expect(placeholderEmoji("Refresco 600 ml", "Extras")).toBe(DRINK_PLACEHOLDER);
  });

  it("uses the burrito emoji for non-drink extras", () => {
    expect(placeholderEmoji("Tortilla", "Extras")).toBe(FOOD_PLACEHOLDER);
    expect(placeholderEmoji("Papitas", "Extras")).toBe(FOOD_PLACEHOLDER);
  });

  it("uses the burrito emoji for a drink name outside Extras", () => {
    expect(placeholderEmoji("Agua", "Burritos")).toBe(FOOD_PLACEHOLDER);
  });

  it("uses the burrito emoji for food categories", () => {
    expect(placeholderEmoji("Asado", "Montadas")).toBe(FOOD_PLACEHOLDER);
  });
});
