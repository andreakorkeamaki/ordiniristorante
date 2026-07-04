import { describe, expect, it } from "vitest";
import {
  aggregateIdenticalOrderItems,
  groupOrderItemsByPreparationArea,
} from "@/lib/order-items";
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

describe("groupOrderItemsByPreparationArea", () => {
  it("raggruppa e aggrega i prodotti nello stesso reparto", () => {
    const result = groupOrderItemsByPreparationArea([
      {
        ...item({ id: "pizza-1" }),
        menu_item_id: "margherita",
        item_name_snapshot: "Margherita",
        preparation_area_snapshot: "pizzeria",
      },
      {
        ...item({ id: "tagliere-1" }),
        menu_item_id: "tagliere",
        item_name_snapshot: "Tagliere",
        preparation_area_snapshot: "cucina",
      },
      {
        ...item({ id: "pizza-2", quantity: 3 }),
        menu_item_id: "margherita",
        item_name_snapshot: "Margherita",
        preparation_area_snapshot: "pizzeria",
      },
    ]);

    expect(result.map((group) => group.label)).toEqual([
      "PIZZERIA",
      "CUCINA / TAGLIERI",
    ]);
    expect(result[0].items.map((entry) => entry.item_name_snapshot)).toEqual([
      "Margherita",
    ]);
    expect(result[0].items[0].quantity).toBe(4);
    expect(result[1].items[0].item_name_snapshot).toBe("Tagliere");
  });

  it("ordina sempre i reparti pizzeria, cucina, bevande e cassa", () => {
    const result = groupOrderItemsByPreparationArea([
      { ...item({ id: "bar" }), preparation_area_snapshot: "bar" },
      { ...item({ id: "pizza" }), preparation_area_snapshot: "pizzeria" },
      { ...item({ id: "cassa" }), preparation_area_snapshot: "cassa" },
      { ...item({ id: "cucina" }), preparation_area_snapshot: "cucina" },
    ]);

    expect(result.map((group) => group.area)).toEqual([
      "pizzeria",
      "cucina",
      "bar",
      "cassa",
    ]);
  });

  it("ignora correzioni di prezzo nell'aggregazione destinata ai reparti", () => {
    const first = {
      ...item({ id: "pizza-1" }),
      preparation_area_snapshot: "pizzeria" as const,
    };
    const corrected = {
      ...item({ id: "pizza-2", quantity: 3 }),
      item_price_snapshot: 18.5,
      line_total: 55.5,
      preparation_area_snapshot: "pizzeria" as const,
    };

    const result = groupOrderItemsByPreparationArea([first, corrected]);

    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].quantity).toBe(4);
  });
});
