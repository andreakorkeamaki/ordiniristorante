import { describe, expect, it } from "vitest";
import { selectAddedOrderItems } from "@/lib/order-update-ticket-core";
import type { OrderItem } from "@/types/domain";

function item(id: string, quantity: number): OrderItem {
  return {
    id,
    order_id: "order-1",
    menu_item_id: id,
    item_name_snapshot: id,
    item_price_snapshot: 10,
    ingredients_snapshot: null,
    quantity,
    line_total: quantity * 10,
    notes: "",
    preparation_area_snapshot: "cucina",
    version: 1,
    extras: [],
  };
}

describe("selectAddedOrderItems", () => {
  it("esclude le righe già ordinate e conserva solo le nuove aggiunte", () => {
    const result = selectAddedOrderItems(
      [item("gia-ordinato", 2), item("nuovo", 1)],
      [{ action: "item_added", payload: { item_id: "nuovo" } }],
    );

    expect(result).toEqual([
      expect.objectContaining({ id: "nuovo", quantity: 1 }),
    ]);
  });

  it("stampa solo l'aumento di quantità di una riga esistente", () => {
    const result = selectAddedOrderItems(
      [item("suppli", 4)],
      [{
        action: "item_quantity_changed",
        payload: { item_id: "suppli", delta: 2 },
      }],
    );

    expect(result[0]).toEqual(
      expect.objectContaining({ id: "suppli", quantity: 2, line_total: 20 }),
    );
  });

  it("considera il saldo netto e non ristampa una quantità tolta", () => {
    const result = selectAddedOrderItems(
      [item("pinsa", 2), item("patate", 1)],
      [
        { action: "item_quantity_changed", payload: { item_id: "pinsa", delta: 1 } },
        { action: "item_quantity_changed", payload: { item_id: "pinsa", delta: -1 } },
        { action: "item_added", payload: { item_id: "patate" } },
        { action: "item_quantity_changed", payload: { item_id: "patate", delta: 1 } },
        { action: "item_quantity_changed", payload: { item_id: "patate", delta: -1 } },
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({ id: "patate", quantity: 1 }),
    ]);
  });
});
