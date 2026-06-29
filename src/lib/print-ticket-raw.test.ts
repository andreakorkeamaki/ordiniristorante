import { describe, expect, it } from "vitest";
import { buildRaw80mmTicket } from "@/lib/print-ticket-raw";
import type { Order } from "@/types/domain";

const order: Order = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 42,
  table_id: "00000000-0000-4000-8000-000000000002",
  status: "confirmed",
  cover_count: 2,
  cover_price_snapshot: 1.9,
  subtotal: 20,
  cover_total: 3.8,
  total: 23.8,
  general_notes: "Senza fretta",
  version: 1,
  created_by: "00000000-0000-4000-8000-000000000003",
  updated_by: "00000000-0000-4000-8000-000000000003",
  created_at: "2026-06-29T12:00:00.000Z",
  updated_at: "2026-06-29T12:00:00.000Z",
  sent_to_cashier_at: "2026-06-29T12:00:00.000Z",
  closed_at: null,
  table: {
    id: "00000000-0000-4000-8000-000000000002",
    table_number: 7,
    display_name: null,
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
      notes: "ben cotta",
      preparation_area_snapshot: "pizzeria",
      version: 1,
      extras: [],
    },
  ],
};

describe("buildRaw80mmTicket", () => {
  it("renders an 80 mm ESC/POS reprint ticket with the required label", () => {
    const ticket = buildRaw80mmTicket(order, "reprint");
    const body = ticket.toString("ascii");

    expect(body).toContain("RISTAMPA");
    expect(body).toContain("COMANDA #42");
    expect(body).toContain("TAVOLO 7");
    expect(body).toContain("2x Pinsa Margherita");
    expect(body).toContain("CAMERIERE: Andre");
    expect(ticket.subarray(-4)).toEqual(Buffer.from([0x1d, 0x56, 0x41, 0x10]));
  });
});
