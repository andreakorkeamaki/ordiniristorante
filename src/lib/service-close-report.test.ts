import { describe, expect, it } from "vitest";
import {
  buildRaw80mmServiceCloseReport,
  buildServiceCloseReportSnapshot,
} from "@/lib/service-close-report";
import type { Order, RestaurantService } from "@/types/domain";

const service: RestaurantService = {
  id: "00000000-0000-4000-8000-000000000001",
  business_date: "2026-07-13",
  period: "cena",
  opened_by: "00000000-0000-4000-8000-000000000002",
  closed_by: "00000000-0000-4000-8000-000000000002",
  opened_at: "2026-07-13T16:30:00.000Z",
  closed_at: "2026-07-13T21:45:00.000Z",
  forced_close: false,
  created_at: "2026-07-13T16:30:00.000Z",
  updated_at: "2026-07-13T21:45:00.000Z",
};

function order(overrides: Partial<Order>): Order {
  return {
    id: crypto.randomUUID(),
    order_number: 50,
    table_id: "00000000-0000-4000-8000-000000000010",
    service_id: service.id,
    order_type: "dine_in",
    takeaway_name: null,
    takeaway_pickup_at: null,
    status: "closed",
    cover_count: 2,
    cover_price_snapshot: 2,
    subtotal: 36,
    cover_total: 4,
    total: 40,
    general_notes: "",
    version: 1,
    created_by: service.opened_by,
    updated_by: service.opened_by,
    created_at: service.opened_at,
    updated_at: service.closed_at!,
    sent_to_cashier_at: service.opened_at,
    closed_at: service.closed_at,
    table: {
      id: "00000000-0000-4000-8000-000000000010",
      table_number: 7,
      display_name: null,
      active: true,
    },
    items: [],
    ...overrides,
  };
}

describe("service close report", () => {
  it("raggruppa lo stesso tavolo, separa gli asporti ed esclude gli annullati", () => {
    const snapshot = buildServiceCloseReportSnapshot(service, [
      order({ order_number: 50, cover_count: 2, total: 40 }),
      order({ order_number: 51, cover_count: 3, total: 60 }),
      order({
        id: "00000000-0000-4000-8000-000000000020",
        order_number: 52,
        table_id: null,
        order_type: "takeaway",
        takeaway_name: "Mario",
        cover_count: 0,
        total: 28,
      }),
      order({
        id: "00000000-0000-4000-8000-000000000030",
        order_number: 53,
        status: "cancelled",
        total: 999,
      }),
    ]);

    expect(snapshot.summary_rows).toEqual([
      expect.objectContaining({
        kind: "dine_in",
        label: "Tavolo 7",
        cover_count: 5,
        total: 100,
      }),
      expect.objectContaining({
        kind: "takeaway",
        label: "Mario",
        order_number: 52,
        total: 28,
      }),
    ]);
    expect(snapshot).toMatchObject({
      dine_in_count: 1,
      takeaway_count: 1,
      cover_count: 5,
      dine_in_total: 100,
      takeaway_total: 28,
      service_total: 128,
    });
  });

  it("stampa il riepilogo su una ricevuta con totale e righe per tavolo", () => {
    const snapshot = buildServiceCloseReportSnapshot(service, [
      order({ total: 86, cover_count: 4 }),
      order({
        id: "00000000-0000-4000-8000-000000000020",
        order_number: 52,
        table_id: null,
        order_type: "takeaway",
        takeaway_name: "Mario",
        cover_count: 0,
        total: 28,
      }),
    ]);
    const printed = buildRaw80mmServiceCloseReport(snapshot).toString("ascii");

    expect(printed).toContain("RIEPILOGO FINE SERVIZIO");
    expect(printed).toContain("CENA - 13/07/2026");
    expect(printed).toContain("Tavolo 7 - 4 cop.");
    expect(printed).toContain("#52 Mario");
    expect(printed).toContain("TOTALE 114,00 EUR");
    expect(printed).not.toContain("PIZZERIA");
    expect(printed).not.toContain("CUCINA");
  });

  it("rifiuta di fotografare un servizio ancora aperto", () => {
    expect(() =>
      buildServiceCloseReportSnapshot({ ...service, closed_at: null }, []),
    ).toThrow("servizio chiuso");
  });
});
