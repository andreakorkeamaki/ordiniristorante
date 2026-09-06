import { describe, expect, it } from "vitest";
import {
  orderEditPayload,
  projectOrderEdit,
  type OrderSnapshot,
} from "@/lib/optimistic-order";
import type { MenuExtra, MenuItem, Order, OrderItem } from "@/types/domain";

const product: MenuItem = {
  id: "pizza-margherita",
  category_id: "pizza",
  name: "Margherita",
  name_en: null,
  description: null,
  description_en: null,
  ingredients: "pomodoro, mozzarella",
  ingredients_en: null,
  price: 10,
  active: true,
  available: true,
  visible_public: true,
  visible_staff: true,
  preparation_area: "pizzeria",
  allergens: [],
  vegetarian: true,
  vegan: false,
  image_url: null,
  sort_order: 1,
};

const mozzarella: MenuExtra = {
  id: "extra-mozzarella",
  category_id: "extra",
  name: "Mozzarella",
  name_en: null,
  price: 2,
  active: true,
  available: true,
  sort_order: 1,
};

const basil: MenuExtra = {
  ...mozzarella,
  id: "extra-basil",
  name: "Basilico",
  price: 3,
};

function item({
  id,
  quantity = 1,
  price = 10,
  extra = false,
  notes = "",
}: {
  id: string;
  quantity?: number;
  price?: number;
  extra?: boolean;
  notes?: string;
}): OrderItem {
  return {
    id,
    order_id: "order-1",
    menu_item_id: product.id,
    item_name_snapshot: product.name,
    item_price_snapshot: price,
    ingredients_snapshot: product.ingredients,
    quantity,
    line_total: price * quantity,
    notes,
    preparation_area_snapshot: product.preparation_area,
    version: 1,
    extras: extra
      ? [{
          id: `${id}:moz`,
          order_item_id: id,
          extra_name_snapshot: mozzarella.name,
          extra_price_snapshot: mozzarella.price,
          quantity,
          total: mozzarella.price * quantity,
        }]
      : [],
  };
}

function snapshot(items: OrderItem[] = [item({ id: "pizza-1", quantity: 5, extra: true })]): OrderSnapshot {
  const subtotal = items.reduce(
    (sum, line) => sum + line.line_total + line.extras.reduce((extraSum, extra) => extraSum + extra.total, 0),
    0,
  );
  const order: Order = {
    id: "order-1",
    order_number: 1,
    table_id: "table-1",
    service_id: "service-1",
    order_type: "dine_in",
    takeaway_name: null,
    takeaway_pickup_at: null,
    status: "confirmed",
    cover_count: 2,
    cover_price_snapshot: 1.5,
    subtotal,
    cover_total: 3,
    total: subtotal + 3,
    general_notes: "",
    version: 4,
    created_by: "profile-1",
    updated_by: "profile-1",
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
    sent_to_cashier_at: null,
    closed_at: null,
  };
  return { order, items, update_print_status: null };
}

describe("projectOrderEdit", () => {
  it("mostra subito il primo prodotto senza creare una comanda vuota", () => {
    const result = projectOrderEdit(
      { order: null, items: [], update_print_status: null },
      {
        type: "add",
        item_id: "first-item",
        menu_item_id: product.id,
        quantity: 2,
        product,
      },
    );

    expect(result.order).toBeNull();
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "first-item",
        order_id: "",
        quantity: 2,
        line_total: 20,
      }),
    ]);
  });

  it("splits one of five pizzas when adding an extra and keeps extra quantities per pizza", () => {
    const result = projectOrderEdit(snapshot(), {
      type: "extra",
      item_id: "pizza-1",
      extra_id: basil.id,
      new_item_id: "pizza-1:basil",
      extra: basil,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ quantity: 4, line_total: 40 });
    expect(result.items[0].extras[0]).toMatchObject({ quantity: 4, total: 8 });
    expect(result.items[1]).toMatchObject({ quantity: 1, line_total: 10 });
    expect(result.items[1].extras).toEqual([
      expect.objectContaining({ extra_name_snapshot: "Mozzarella", quantity: 1, total: 2 }),
      expect.objectContaining({ extra_name_snapshot: "Basilico", quantity: 1, total: 3 }),
    ]);
    expect(result.order).toMatchObject({ subtotal: 63, cover_total: 3, total: 66 });
  });

  it("keeps the customized variant stable when its quantity increases", () => {
    const split = projectOrderEdit(snapshot(), {
      type: "extra",
      item_id: "pizza-1",
      extra_id: basil.id,
      new_item_id: "pizza-1:basil",
      extra: basil,
    });
    const result = projectOrderEdit(split, {
      type: "quantity",
      item_ids: ["pizza-1:basil"],
      delta: 1,
    });

    expect(result.items[1]).toMatchObject({ quantity: 2, line_total: 20 });
    expect(result.items[1].extras).toEqual([
      expect.objectContaining({ quantity: 2, total: 4 }),
      expect.objectContaining({ quantity: 2, total: 6 }),
    ]);
  });

  it("splits one pizza for a note without losing its existing extra", () => {
    const result = projectOrderEdit(snapshot(), {
      type: "note",
      item_id: "pizza-1",
      notes: "Senza cipolla",
      expected_notes: "",
      new_item_id: "pizza-1:note",
    });

    expect(result.items[0]).toMatchObject({ quantity: 4, line_total: 40, notes: "" });
    expect(result.items[0].extras[0]).toMatchObject({ quantity: 4, total: 8 });
    expect(result.items[1]).toMatchObject({ quantity: 1, line_total: 10, notes: "Senza cipolla" });
    expect(result.items[1].extras[0]).toMatchObject({ quantity: 1, total: 2 });
    expect(result.order).toMatchObject({ subtotal: 60, cover_total: 3, total: 63 });
  });

  it("splits one pizza when removing an extra and updates totals", () => {
    const result = projectOrderEdit(snapshot(), {
      type: "remove_extra",
      item_id: "pizza-1",
      extra_id: "pizza-1:moz",
      new_item_id: "pizza-1:plain",
    });

    expect(result.items[0]).toMatchObject({ quantity: 4, line_total: 40 });
    expect(result.items[0].extras[0]).toMatchObject({ quantity: 4, total: 8 });
    expect(result.items[1]).toMatchObject({ quantity: 1, line_total: 10 });
    expect(result.items[1].extras).toEqual([]);
    expect(result.order).toMatchObject({ subtotal: 58, cover_total: 3, total: 61 });
  });

  it("decreases grouped raw quantities in the supplied order", () => {
    const result = projectOrderEdit(
      snapshot([
        item({ id: "pizza-a", quantity: 2, extra: false }),
        item({ id: "pizza-b", quantity: 3, extra: false }),
        item({ id: "pizza-c", quantity: 4, extra: false }),
      ]),
      { type: "quantity", item_ids: ["pizza-a", "pizza-b", "pizza-c"], delta: -5 },
    );

    expect(result.items.map(({ id, quantity }) => ({ id, quantity }))).toEqual([
      { id: "pizza-c", quantity: 4 },
    ]);
    expect(result.order).toMatchObject({ subtotal: 40, cover_total: 3, total: 43 });
  });
});

describe("orderEditPayload", () => {
  it("strips catalogue metadata while preserving operation fields", () => {
    const edit = {
      type: "extra" as const,
      item_id: "pizza-1",
      extra_id: basil.id,
      new_item_id: "pizza-1:basil",
      extra: basil,
    };
    expect(orderEditPayload(edit)).toEqual({
      type: "extra",
      item_id: "pizza-1",
      extra_id: basil.id,
      new_item_id: "pizza-1:basil",
    });
    expect(edit.extra).toBe(basil);
  });
});
