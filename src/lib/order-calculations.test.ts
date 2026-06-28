import { describe, expect, it } from "vitest";
import { calculateTotals, validateAllYouCanEat } from "@/lib/order-calculations";
import type { OrderItem } from "@/types/domain";

function item(name: string, quantity: number, lineTotal: number): OrderItem {
  return {
    id: crypto.randomUUID(),
    order_id: crypto.randomUUID(),
    menu_item_id: null,
    item_name_snapshot: name,
    item_price_snapshot: lineTotal / quantity,
    ingredients_snapshot: null,
    quantity,
    line_total: lineTotal,
    notes: "",
    preparation_area_snapshot: "cucina",
    version: 1,
    extras: [],
  };
}

describe("order calculations", () => {
  it("calcola subtotale, coperti e totale con decimali esatti", () => {
    expect(calculateTotals([item("Margherita", 2, 15), item("Acqua", 1, 2)], 3, 1.9)).toEqual({
      subtotal: 17,
      coverTotal: 5.7,
      total: 22.7,
    });
  });

  it("richiede una formula All You Can Eat per ogni coperto", () => {
    expect(validateAllYouCanEat([item("All You Can Eat · Adulti", 2, 33.8)], 3)).toEqual({
      active: true,
      valid: false,
      quantity: 2,
    });
    expect(validateAllYouCanEat([item("All You Can Eat · Adulti", 3, 50.7)], 3).valid).toBe(true);
  });

  it("non applica il vincolo alle comande normali", () => {
    expect(validateAllYouCanEat([item("Margherita", 1, 7.5)], 0).valid).toBe(true);
  });
});
