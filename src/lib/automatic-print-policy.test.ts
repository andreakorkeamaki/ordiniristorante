import { describe, expect, it } from "vitest";
import { getWaiterInitialPrintDecision } from "@/lib/automatic-print-policy";

const now = new Date("2026-07-01T10:00:00.000Z").getTime();

describe("getWaiterInitialPrintDecision", () => {
  it("consente solo la prima stampa della propria comanda appena inviata", () => {
    expect(
      getWaiterInitialPrintDecision(
        "waiter-1",
        {
          created_by: "waiter-1",
          status: "pending_cashier",
          sent_to_cashier_at: "2026-07-01T09:59:00.000Z",
        },
        now,
      ),
    ).toBe("allowed");
  });

  it("blocca ordini di altri camerieri, vecchi o già in lavorazione", () => {
    expect(
      getWaiterInitialPrintDecision(
        "waiter-1",
        {
          created_by: "waiter-2",
          status: "pending_cashier",
          sent_to_cashier_at: "2026-07-01T09:59:00.000Z",
        },
        now,
      ),
    ).toBe("not-owner");

    expect(
      getWaiterInitialPrintDecision(
        "waiter-1",
        {
          created_by: "waiter-1",
          status: "pending_cashier",
          sent_to_cashier_at: "2026-07-01T09:30:00.000Z",
        },
        now,
      ),
    ).toBe("submission-too-old");

    expect(
      getWaiterInitialPrintDecision(
        "waiter-1",
        {
          created_by: "waiter-1",
          status: "in_preparation",
          sent_to_cashier_at: "2026-07-01T09:59:00.000Z",
        },
        now,
      ),
    ).toBe("invalid-status");
  });
});
