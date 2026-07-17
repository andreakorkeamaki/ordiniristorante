import { describe, expect, it } from "vitest";
import {
  businessDateToday,
  normalizeAdminAnalytics,
  normalizeCostCatalog,
  resolveAnalyticsRange,
} from "@/lib/admin-analytics";

describe("admin analytics", () => {
  it("usa gli ultimi trenta giorni e il fuso del ristorante", () => {
    const now = new Date("2026-07-17T22:30:00Z");
    expect(businessDateToday(now)).toBe("2026-07-18");
    expect(resolveAnalyticsRange({}, "2026-07-18")).toEqual({
      from: "2026-06-19",
      to: "2026-07-18",
      period: null,
      orderType: null,
    });
  });

  it("accetta date e turno validi e scarta filtri incoerenti", () => {
    expect(
      resolveAnalyticsRange(
        {
          from: "2026-07-01",
          to: "2026-07-17",
          period: "cena",
          order_type: "takeaway",
        },
        "2026-07-17",
      ),
    ).toEqual({
      from: "2026-07-01",
      to: "2026-07-17",
      period: "cena",
      orderType: "takeaway",
    });
    expect(
      resolveAnalyticsRange(
        {
          from: "2026-07-20",
          to: "2026-07-01",
          period: "altro",
          order_type: "altro",
        },
        "2026-07-17",
      ),
    ).toEqual({
      from: "2026-06-18",
      to: "2026-07-17",
      period: null,
      orderType: null,
    });
  });

  it("normalizza numeri Postgres e lascia nullo il margine incompleto", () => {
    const result = normalizeAdminAnalytics({
      metrics: {
        revenue: "120.50",
        order_count: 4,
        cost_coverage: 75,
        gross_profit: null,
      },
      top_pizzas: [{ name: "Margherita", quantity: "6", revenue: "45" }],
      services: [],
    });

    expect(result.metrics.revenue).toBe(120.5);
    expect(result.metrics.gross_profit).toBeNull();
    expect(result.top_pizzas[0]).toEqual({
      name: "Margherita",
      quantity: 6,
      revenue: 45,
    });
  });

  it("normalizza il catalogo costi senza trasformare i mancanti in zero", () => {
    const result = normalizeCostCatalog({
      items: [
        {
          id: "pizza",
          name: "Margherita",
          category: "Pinse rosse",
          price: "7.50",
          unit_cost: null,
          active: true,
        },
      ],
    });

    expect(result.items[0].price).toBe(7.5);
    expect(result.items[0].unit_cost).toBeNull();
  });
});
