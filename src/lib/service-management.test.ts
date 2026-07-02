import { describe, expect, it } from "vitest";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import type { RestaurantService } from "@/types/domain";

const service: RestaurantService = {
  id: "00000000-0000-4000-8000-000000000001",
  business_date: "2026-07-02",
  period: "pranzo",
  opened_by: "00000000-0000-4000-8000-000000000002",
  closed_by: null,
  opened_at: "2026-07-02T10:00:00.000Z",
  closed_at: null,
  created_at: "2026-07-02T10:00:00.000Z",
  updated_at: "2026-07-02T10:00:00.000Z",
};

describe("service management", () => {
  it("formatta il servizio operativo in italiano", () => {
    expect(formatServiceLabel(service)).toBe("Pranzo · 02/07/2026");
  });

  it("riconosce servizi precedenti e di recupero", () => {
    expect(isPreviousService(service, "2026-07-02")).toBe(false);
    expect(isPreviousService(service, "2026-07-03")).toBe(true);
    expect(
      isPreviousService({ ...service, period: "recupero" }, "2026-07-02"),
    ).toBe(true);
  });
});
