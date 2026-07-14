import { describe, expect, it } from "vitest";
import { buildCashierTableRows } from "@/lib/cashier-tables";
import type { Order, RestaurantTable } from "@/types/domain";

const serviceId = "00000000-0000-4000-8000-000000000100";
const tables = [1, 2, 3].map((tableNumber) => ({
  id: `00000000-0000-4000-8000-00000000000${tableNumber}`,
  table_number: tableNumber,
  display_name: null,
  active: true,
})) satisfies RestaurantTable[];

function order(overrides: Partial<Order> & Pick<Order, "id" | "table_id" | "status">) {
  return {
    order_number: Number(overrides.id.at(-1)),
    service_id: serviceId,
    order_type: "dine_in",
    takeaway_name: null,
    takeaway_pickup_at: null,
    cover_count: 2,
    cover_price_snapshot: 2,
    subtotal: 20,
    cover_total: 4,
    total: 24,
    general_notes: "",
    version: 1,
    created_by: "00000000-0000-4000-8000-000000000090",
    updated_by: "00000000-0000-4000-8000-000000000090",
    created_at: "2026-07-14T18:00:00.000Z",
    updated_at: "2026-07-14T18:00:00.000Z",
    sent_to_cashier_at: null,
    closed_at: overrides.status === "closed" ? "2026-07-14T18:30:00.000Z" : null,
    ...overrides,
  } as Order;
}

describe("buildCashierTableRows", () => {
  it("mostra solo i tavoli usati nel servizio corrente, con gli attivi prima dei chiusi", () => {
    const rows = buildCashierTableRows(
      tables,
      [
        order({ id: "order-2", table_id: tables[1].id, status: "closed" }),
        order({ id: "order-3", table_id: tables[2].id, status: "confirmed" }),
      ],
      serviceId,
    );

    expect(rows.map((row) => row.table.table_number)).toEqual([3, 2]);
    expect(rows[0].activeOrder?.status).toBe("confirmed");
    expect(rows[1].closedOrder?.status).toBe("closed");
  });

  it("usa solo l'ultima chiusura del servizio corrente", () => {
    const previousServiceOrder = order({
      id: "order-old",
      table_id: tables[0].id,
      status: "closed",
      service_id: "00000000-0000-4000-8000-000000000099",
      closed_at: "2026-07-14T19:00:00.000Z",
    });
    const firstCurrentOrder = order({
      id: "order-first",
      table_id: tables[0].id,
      status: "closed",
      closed_at: "2026-07-14T18:30:00.000Z",
    });
    const latestCurrentOrder = order({
      id: "order-latest",
      table_id: tables[0].id,
      status: "closed",
      closed_at: "2026-07-14T18:45:00.000Z",
    });

    const [row] = buildCashierTableRows(
      [tables[0]],
      [previousServiceOrder, firstCurrentOrder, latestCurrentOrder],
      serviceId,
    );

    expect(row.closedOrder?.id).toBe(latestCurrentOrder.id);
  });

  it("nasconde anche un tavolo attivo appartenente a un altro servizio", () => {
    const rows = buildCashierTableRows(
      [tables[0]],
      [
        order({
          id: "order-old-active",
          table_id: tables[0].id,
          status: "confirmed",
          service_id: "00000000-0000-4000-8000-000000000099",
        }),
      ],
      serviceId,
    );

    expect(rows).toEqual([]);
  });
});
