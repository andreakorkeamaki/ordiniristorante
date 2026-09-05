import { describe, expect, it } from "vitest";
import {
  aggregateIdenticalOrderItems,
  applyPendingQuantityDeltas,
  buildQuantityChangeOperations,
  getIdenticalOrderItemIds,
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
          quantity,
          total: quantity,
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

  it("somma quantità e importi degli extra nelle righe aggregate", () => {
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

describe("getIdenticalOrderItemIds", () => {
  it("mappa una variante visualizzata alle sue righe raw", () => {
    expect(
      getIdenticalOrderItemIds(
        [
          item({ id: "item-1", extraName: "Mozzarella" }),
          item({ id: "item-2", extraName: "Mozzarella" }),
          item({ id: "item-3", notes: "Senza glutine" }),
        ],
        "item-1",
      ),
    ).toEqual(["item-1", "item-2"]);
  });
});

describe("buildQuantityChangeOperations", () => {
  it("accorpa più incrementi sulla stessa riga", () => {
    expect(
      buildQuantityChangeOperations([item({ id: "item-1" })], "item-1", 3),
    ).toEqual([{ itemId: "item-1", delta: 3 }]);
  });

  it("distribuisce i decrementi tra righe identiche", () => {
    expect(
      buildQuantityChangeOperations(
        [
          item({ id: "item-1" }),
          item({ id: "item-2" }),
          item({ id: "item-3", quantity: 2 }),
        ],
        "item-1",
        -3,
      ),
    ).toEqual([
      { itemId: "item-1", delta: -1 },
      { itemId: "item-2", delta: -1 },
      { itemId: "item-3", delta: -1 },
    ]);
  });

  it("non modifica righe con note diverse", () => {
    expect(
      buildQuantityChangeOperations(
        [
          item({ id: "item-1" }),
          item({ id: "item-2", notes: "Senza glutine" }),
        ],
        "item-1",
        -2,
      ),
    ).toEqual([{ itemId: "item-1", delta: -1 }]);
  });
});

describe("applyPendingQuantityDeltas", () => {
  it("mostra subito il totale dei tocchi ancora da salvare", () => {
    const result = applyPendingQuantityDeltas(
      [item({ id: "item-1" }), item({ id: "item-2", quantity: 2 })],
      { "item-1": 2 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ quantity: 5, line_total: 84.5 });
  });

  it("nasconde subito una riga portata a zero", () => {
    expect(
      applyPendingQuantityDeltas([item({ id: "item-1" })], { "item-1": -1 }),
    ).toEqual([]);
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

  it("unisce in preparazione la stessa variante con extra su più quantità", () => {
    const result = groupOrderItemsByPreparationArea([
      item({ id: "pizza-1", quantity: 2, extraName: "Mozzarella" }),
      item({ id: "pizza-2", quantity: 3, extraName: "Mozzarella" }),
    ]);

    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0]).toMatchObject({ quantity: 5 });
    expect(result[0].items[0].extras[0]).toMatchObject({
      quantity: 5,
      total: 5,
    });
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
