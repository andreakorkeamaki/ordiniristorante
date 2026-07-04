import { describe, expect, it } from "vitest";
import { reorderCategoryMenuItems } from "@/lib/menu-ordering";
import type { MenuItem } from "@/types/domain";

function menuItem(id: string, categoryId: string, sortOrder: number): MenuItem {
  return {
    id,
    category_id: categoryId,
    name: id,
    name_en: null,
    description: null,
    description_en: null,
    ingredients: null,
    ingredients_en: null,
    price: 10,
    active: true,
    available: true,
    visible_public: true,
    visible_staff: true,
    preparation_area: "cucina",
    allergens: [],
    vegetarian: false,
    vegan: false,
    image_url: null,
    sort_order: sortOrder,
  };
}

describe("reorderCategoryMenuItems", () => {
  const items = [
    menuItem("Margherita", "pizze", 0),
    menuItem("Capricciosa", "pizze", 1),
    menuItem("Diavola", "pizze", 2),
  ];

  it("sposta un prodotto prima del prodotto indicato e rinumera l'ordine", () => {
    const result = reorderCategoryMenuItems(
      items,
      "Diavola",
      "Margherita",
      "before",
    );

    expect(result.map((item) => item.id)).toEqual([
      "Diavola",
      "Margherita",
      "Capricciosa",
    ]);
    expect(result.map((item) => item.sort_order)).toEqual([0, 1, 2]);
  });

  it("sposta un prodotto dopo il prodotto indicato", () => {
    const result = reorderCategoryMenuItems(
      items,
      "Margherita",
      "Diavola",
      "after",
    );

    expect(result.map((item) => item.id)).toEqual([
      "Capricciosa",
      "Diavola",
      "Margherita",
    ]);
  });

  it("non permette di usare come destinazione un prodotto di un'altra categoria", () => {
    const result = reorderCategoryMenuItems(
      items,
      "Margherita",
      "Tagliere",
      "after",
    );

    expect(result).toBe(items);
  });
});
