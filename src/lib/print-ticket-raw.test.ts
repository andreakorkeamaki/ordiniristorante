import { describe, expect, it } from "vitest";
import {
  buildRaw80mmTicket,
  getPinsaPrintPrefix,
} from "@/lib/print-ticket-raw";
import type { Order } from "@/types/domain";

const order: Order = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 42,
  table_id: "00000000-0000-4000-8000-000000000002",
  service_id: "00000000-0000-4000-8000-000000000004",
  order_type: "dine_in",
  takeaway_name: null,
  takeaway_pickup_at: null,
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
      notes: "ben cotta",
      preparation_area_snapshot: "pizzeria",
      version: 1,
      category_slug: "rosse",
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

describe("buildRaw80mmTicket", () => {
  it("prefissa le pinse rosse, bianche e speciali", () => {
    expect(getPinsaPrintPrefix("rosse")).toBe("R");
    expect(getPinsaPrintPrefix("bianche")).toBe("B");
    expect(getPinsaPrintPrefix("speciali")).toBe("S");
    expect(getPinsaPrintPrefix("antipasti")).toBe("");
  });

  it("stampa tutto il ticket a larghezza e altezza doppie", () => {
    const ticket = buildRaw80mmTicket(order, "new_order");

    expect(ticket.includes(Buffer.from([0x1d, 0x21, 0x11]))).toBe(true);
    expect(ticket.includes(Buffer.from([0x1d, 0x21, 0x00]))).toBe(false);
    expect(ticket.toString("ascii")).toContain("-".repeat(24));
  });

  it("renders an 80 mm ESC/POS reprint ticket with the required label", () => {
    const ticket = buildRaw80mmTicket(order, "reprint");
    const body = ticket.toString("ascii");

    expect(body).toContain("RISTAMPA");
    expect(body).toContain("COMANDA #42");
    expect(body).toContain("TAVOLO 7 - Terrazza");
    expect(body).toContain("ROSSE");
    expect(body).toContain("2x R Pinsa Margherita");
    expect(body).not.toContain("CAMERIERE:");
    expect(ticket.subarray(-4)).toEqual(Buffer.from([0x1d, 0x56, 0x41, 0x10]));
  });

  it("stampa la nuova comanda operativa senza alcun dato economico", () => {
    const body = buildRaw80mmTicket(order, "new_order").toString("ascii");

    expect(body).toContain("NUOVA COMANDA");
    expect(body).toContain("TAVOLO 7");
    expect(body).toContain("2x R Pinsa Margherita");
    expect(body).toContain("NOTA: ben cotta");
    expect(body).toContain("+ 1x Mozzarella");
    expect(body).toContain("NOTE TAVOLO:");
    expect(body).toContain("Senza fretta");

    expect(body).not.toMatch(/PREZZ|SUBTOTALE|TOTALE|SCONTO|EUR|EURO/i);
    expect(body).not.toContain("23.80");
    expect(body).not.toContain("10.00");
    expect(body).not.toContain("1.50");
    expect(body).not.toContain("COPERTI:");
  });

  it("stampa una sola riga con la quantità totale per prodotti uguali", () => {
    const repeatedItems: Order = {
      ...order,
      items: Array.from({ length: 4 }, (_, index) => ({
        ...order.items![0],
        id: `item-${index + 1}`,
        quantity: 1,
        line_total: 10,
        notes: "",
        extras: [],
      })),
    };

    const body = buildRaw80mmTicket(repeatedItems, "new_order").toString("ascii");

    expect(body).toContain("4x R Pinsa Margherita");
    expect(body.match(/Pinsa Margherita/g)).toHaveLength(1);
  });

  it("stampa nome e ora di ritiro senza tavolo o coperti per un asporto", () => {
    const takeaway: Order = {
      ...order,
      table_id: null,
      table: undefined,
      order_type: "takeaway",
      takeaway_name: "Giulia",
      takeaway_pickup_at: "2026-06-29T18:30:00.000Z",
      cover_count: 0,
      cover_price_snapshot: 0,
      cover_total: 0,
    };

    const body = buildRaw80mmTicket(takeaway, "new_order").toString("ascii");

    expect(body).toContain("ASPORTO - Giulia");
    expect(body).toContain("RITIRO 20:30");
    expect(body).toContain("NOTE ORDINE:");
    expect(body).not.toContain("TAVOLO");
    expect(body).not.toContain("COPERTI:");
  });

  it("produce una sola comanda con i prodotti raggruppati per categoria", () => {
    const multiDepartmentOrder: Order = {
      ...order,
      items: [
        {
          ...order.items![0],
          category_name: "Pinse rosse",
          category_sort_order: 2,
        },
        {
          ...order.items![0],
          id: "item-2",
          menu_item_id: "tagliere",
          item_name_snapshot: "Tagliere misto",
          preparation_area_snapshot: "cucina",
          category_name: "Antipasti e fritti",
          category_slug: "antipasti",
          category_sort_order: 0,
          notes: "Senza salumi",
          extras: [],
        },
        {
          ...order.items![0],
          id: "item-3",
          menu_item_id: "acqua",
          item_name_snapshot: "Acqua",
          preparation_area_snapshot: "bar",
          category_name: "Bevande",
          category_slug: "bevande",
          category_sort_order: 8,
          notes: "",
          extras: [],
        },
      ],
    };

    const body = buildRaw80mmTicket(multiDepartmentOrder, "new_order")
      .toString("ascii");

    expect(body.split("\u001dVA\u0010").filter(Boolean)).toHaveLength(1);
    expect(body).toContain("ANTIPASTI E FRITTI");
    expect(body).toContain("PINSE ROSSE");
    expect(body).toContain("BEVANDE");
    expect(body.indexOf("ANTIPASTI E FRITTI")).toBeLessThan(
      body.indexOf("PINSE ROSSE"),
    );
    expect(body.indexOf("PINSE ROSSE")).toBeLessThan(body.indexOf("BEVANDE"));
    expect(body).toContain("Tagliere misto");
    expect(body).toContain("NOTA: Senza salumi");
    expect(body).toContain("Pinsa Margherita");
    expect(body).toContain("Acqua");
  });
});
