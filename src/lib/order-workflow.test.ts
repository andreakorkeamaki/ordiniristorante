import { describe, expect, it } from "vitest";
import {
  canEditOrder,
  canSendOrderUpdate,
} from "@/lib/order-workflow";

describe("order workflow", () => {
  it("mantiene modificabile il tavolo dopo il primo invio", () => {
    expect(canEditOrder("draft")).toBe(true);
    expect(canEditOrder("pending_cashier")).toBe(true);
    expect(canEditOrder("confirmed")).toBe(true);
    expect(canEditOrder("in_preparation")).toBe(true);
    expect(canEditOrder("bill_requested")).toBe(true);
  });

  it("blocca soltanto tavoli chiusi o annullati", () => {
    expect(canEditOrder("closed")).toBe(false);
    expect(canEditOrder("cancelled")).toBe(false);
  });

  it("crea aggiornamenti solo dopo il primo invio", () => {
    expect(canSendOrderUpdate("draft")).toBe(false);
    expect(canSendOrderUpdate("pending_cashier")).toBe(true);
    expect(canSendOrderUpdate("in_preparation")).toBe(true);
  });
});
