import { describe, expect, it } from "vitest";
import { aggregateIdenticalOrderItems } from "@/lib/order-items";
import type { OrderItem } from "@/types/domain";

function item({
  id,
  quantity = 1,
  notes = "",
  extraName,
}: {
  id: string;
  quantity?: number;
  notes?: string;
  extraName?: string;
}): OrderItem {
  return {
    id,
    order_id: "order-1",
    menu_item_id: "ayce-adulti",
    item_name_snapshot: "All You Can Eat · Adulti",
    item_price_snapshot: 16.9,
    ingredients_snapshot: null,
    quantity,
    line_total: 16.9 * quantity,
    notes,
    preparation_area_snapshot: "cucina",
    version: 1,
    extras: extraName
      ? [{
          id: `extra-${id}`,
          order_item_id: id,
          extra_name_snapshot: extraName,
          extra_price_snapshot: 1,
          quantity: 1,
          total: 1,
        }]
      : [],
  };
}

describe("aggregateIdenticalOrderItems", () => {
  it("somma prodotti uguali inseriti su righe diverse", () => {
    const result = aggregateIdenticalOrderItems([
      item({ id: "item-1" }),
      item({ id: "item-2" }),
      item({ id: "item-3", quantity: 2 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "item-1",
      quantity: 4,
      line_total: 67.6,
    });
  });

  it("mantiene separate le preparazioni con note o extra diversi", () => {
    const result = aggregateIdenticalOrderItems([
      item({ id: "item-1" }),
      item({ id: "item-2", notes: "Senza glutine" }),
      item({ id: "item-3", extraName: "Mozzarella" }),
    ]);

    expect(result).toHaveLength(3);
  });

  it("somma anche quantità e totale degli extra identici", () => {
    const result = aggregateIdenticalOrderItems([
      item({ id: "item-1", extraName: "Mozzarella" }),
      item({ id: "item-2", extraName: "Mozzarella" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].extras[0]).toMatchObject({
      quantity: 2,
      total: 2,
    });
  });
});
