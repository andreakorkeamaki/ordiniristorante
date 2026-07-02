import { describe, expect, it, vi } from "vitest";
import { buildRaw80mmReceipt } from "@/lib/print-receipt-raw";
import type { Order } from "@/types/domain";

const order: Order = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 42,
  table_id: "00000000-0000-4000-8000-000000000002",
  service_id: "00000000-0000-4000-8000-000000000004",
  status: "bill_requested",
  cover_count: 2,
  cover_price_snapshot: 1.9,
  subtotal: 21.5,
  cover_total: 3.8,
  total: 25.3,
  general_notes: "",
  version: 1,
  created_by: "00000000-0000-4000-8000-000000000003",
  updated_by: "00000000-0000-4000-8000-000000000003",
  created_at: "2026-07-02T12:00:00.000Z",
  updated_at: "2026-07-02T12:00:00.000Z",
  sent_to_cashier_at: "2026-07-02T12:00:00.000Z",
  closed_at: null,
  table: {
    id: "00000000-0000-4000-8000-000000000002",
    table_number: 7,
    display_name: "Terrazza",
    active: true,
  },
  waiter: {
    id: "00000000-0000-4000-8000-000000000003",
    full_name: "André",
  },
  items: [
    {
      id: "item-1",
      order_id: "00000000-0000-4000-8000-000000000001",
      menu_item_id: null,
      item_name_snapshot: "Pinsa Margherita",
      item_price_snapshot: 10,
      ingredients_snapshot: null,
      quantity: 2,
      line_total: 20,
      notes: "",
      preparation_area_snapshot: "pizzeria",
      version: 1,
      extras: [
        {
          id: "extra-1",
          order_item_id: "item-1",
          extra_name_snapshot: "Mozzarella",
          extra_price_snapshot: 1.5,
          quantity: 1,
          total: 1.5,
        },
      ],
    },
  ],
};

describe("buildRaw80mmReceipt", () => {
  it("stampa prezzi, coperto e totale su uno scontrino 80 mm", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T18:30:00.000Z"));

    const ticket = buildRaw80mmReceipt(order);
    const body = ticket.toString("ascii");

    expect(body).toContain("SCONTRINO");
    expect(body).toContain("TAVOLO 7 - Terrazza");
    expect(body).toContain("Pinsa Margherita");
    expect(body).toContain("2 x 10,00 EUR");
    expect(body).toContain("20,00 EUR");
    expect(body).toContain("+ Mozzarella");
    expect(body).toContain("1 x 1,50 EUR");
    expect(body).toContain("SUBTOTALE");
    expect(body).toContain("21,50 EUR");
    expect(body).toContain("COPERTO 2 x 1,90 EUR");
    expect(body).toContain("3,80 EUR");
    expect(body).toContain("TOTALE");
    expect(body).toContain("25,30 EUR");
    expect(ticket.subarray(-4)).toEqual(Buffer.from([0x1d, 0x56, 0x41, 0x10]));

    vi.useRealTimers();
  });
});
