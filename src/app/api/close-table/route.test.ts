import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  loadOrderForPrint: vi.fn(),
  createPrintNodeJob: vi.fn(),
  getPrinterAvailability: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock("@/lib/load-order-for-print", () => ({
  loadOrderForPrint: mocks.loadOrderForPrint,
}));
vi.mock("@/lib/print-receipt-raw", () => ({
  buildRaw80mmReceipt: vi.fn(() => Buffer.from("SCONTRINO", "ascii")),
}));
vi.mock("@/lib/printnode", () => {
  class PrintNodeSubmissionError extends Error {
    readonly outcomeUncertain: boolean;

    constructor(message: string, outcomeUncertain = false) {
      super(message);
      this.outcomeUncertain = outcomeUncertain;
    }
  }

  class PrintNodeIdempotencyError extends PrintNodeSubmissionError {}

  return {
    createPrintNodeJob: mocks.createPrintNodeJob,
    getPrinterAvailability: mocks.getPrinterAvailability,
    PrintNodeSubmissionError,
    PrintNodeIdempotencyError,
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { POST } from "@/app/api/close-table/route";
import { PrintNodeIdempotencyError } from "@/lib/printnode";

const order = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 42,
  status: "bill_requested",
} as Order;

function request() {
  return new Request("http://localhost/api/close-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.id }),
  });
}

describe("POST /api/close-table", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfile.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      active: true,
      role: "cashier",
    });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.loadOrderForPrint.mockResolvedValue(order);
    mocks.getPrinterAvailability.mockResolvedValue({
      configured: true,
      available: true,
      message: "Stampante online",
      printer: {},
    });
    mocks.createPrintNodeJob.mockResolvedValue({ id: 321, recovered: false });
    rpc.mockResolvedValue({ error: null });
  });

  it("invia una sola copia e chiude il tavolo dopo l'accettazione PrintNode", async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `${order.id}:receipt`,
        copies: 1,
      }),
    );
    expect(rpc).toHaveBeenCalledWith("close_order", { p_order_id: order.id });
    expect(payload).toMatchObject({
      closed: true,
      copies: 1,
      printNodeJobId: 321,
      idempotent: false,
    });
  });

  it("non chiude il tavolo se la stampante non è disponibile", async () => {
    mocks.getPrinterAvailability.mockResolvedValue({
      configured: true,
      available: false,
      message: "Stampante offline",
      printer: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("non chiude ordini che non sono in lavorazione o al conto", async () => {
    mocks.loadOrderForPrint.mockResolvedValue({ ...order, status: "pending_cashier" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("su retry idempotente chiude senza inviare una seconda copia", async () => {
    mocks.createPrintNodeJob.mockRejectedValue(
      new PrintNodeIdempotencyError("Idempotency key collision"),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("close_order", { p_order_id: order.id });
    expect(payload).toMatchObject({
      closed: true,
      copies: 1,
      printNodeJobId: null,
      idempotent: true,
    });
  });
});
