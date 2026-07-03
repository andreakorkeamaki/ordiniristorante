import { describe, expect, it } from "vitest";
import {
  aggregateMenuItemQuantities,
  calculateTotals,
  getOrderSubmissionIssue,
} from "@/lib/order-calculations";
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
  it("somma le quantità dello stesso prodotto anche su righe diverse", () => {
    const first = item("Tris di bruschette miste", 1, 5);
    const second = item("Tris di bruschette miste", 2, 10);
    const water = item("Acqua", 1, 2);
    first.menu_item_id = "tris";
    second.menu_item_id = "tris";
    water.menu_item_id = "acqua";

    expect(aggregateMenuItemQuantities([first, second, water])).toEqual({
      tris: 3,
      acqua: 1,
    });
  });

  it("calcola subtotale, coperti e totale con decimali esatti", () => {
    expect(calculateTotals([item("Margherita", 2, 15), item("Acqua", 1, 2)], 3, 1.9)).toEqual({
      subtotal: 17,
      coverTotal: 5.7,
      total: 22.7,
    });
  });

  it("tratta formule All You Can Eat e coperti come quantità indipendenti", () => {
    const items = [item("All You Can Eat · Adulti", 2, 33.8)];

    expect(
      getOrderSubmissionIssue({
        status: "draft",
        itemCount: items.length,
        saving: "saved",
      }),
    ).toBeNull();
  });

  it("permette l'invio quando prodotti e salvataggio sono validi", () => {
    const items = [item("Margherita", 1, 7.5)];

    expect(
      getOrderSubmissionIssue({
        status: "draft",
        itemCount: items.length,
        saving: "saved",
      }),
    ).toBeNull();
  });
});
