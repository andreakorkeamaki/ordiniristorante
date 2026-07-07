import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, PrintJob } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  loadOrderForPrint: vi.fn(),
  createPrintNodeJob: vi.fn(),
  findPrintNodeJobBySource: vi.fn(),
  getPrintNodeJobStates: vi.fn(),
  getPrinterAvailability: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
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
  return {
    createPrintNodeJob: mocks.createPrintNodeJob,
    findPrintNodeJobBySource: mocks.findPrintNodeJobBySource,
    getPrintNodeJobStates: mocks.getPrintNodeJobStates,
    getPrinterAvailability: mocks.getPrinterAvailability,
    PrintNodeSubmissionError,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/close-table/route";
import { PrintNodeSubmissionError } from "@/lib/printnode";

const order = {
  id: "00000000-0000-4000-8000-000000000001",
  order_number: 42,
  status: "bill_requested",
  version: 7,
} as Order;

const receiptJob = {
  id: "00000000-0000-4000-8000-000000000010",
  order_id: order.id,
  job_type: "receipt",
  idempotency_key: `${order.id}:receipt`,
  status: "pending",
  copies: 1,
  retry_count: 0,
  attempt_number: 1,
  printnode_job_id: null,
  processing_started_at: null,
  created_at: "2026-07-06T10:00:00.000Z",
} as PrintJob;

function request(
  body: Record<string, unknown> = { action: "dispatch", orderId: order.id },
) {
  return new Request("http://localhost/api/close-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function supabaseMock(options?: {
  job?: PrintJob;
  currentOrder?: Order;
  state?: string;
  rpcError?: { message: string } | null;
  recordSubmissionFails?: boolean;
}) {
  let currentJob = options?.job ?? receiptJob;
  const currentOrder = options?.currentOrder ?? order;
  const rpc = vi.fn(async (name: string) => {
    if (options?.rpcError) return { data: null, error: options.rpcError };
    if (name === "get_or_create_receipt_print_job") {
      return { data: currentJob, error: null };
    }
    if (name === "claim_print_job") {
      currentJob = {
        ...currentJob,
        status: "printing",
        retry_count: currentJob.retry_count + 1,
        processing_started_at: "2026-07-06T10:01:00.000Z",
      };
      return { data: { job: currentJob, claimed: true }, error: null };
    }
    if (name === "record_printnode_submission") {
      if (options?.recordSubmissionFails) {
        return { data: null, error: { message: "database unavailable" } };
      }
      currentJob = {
        ...currentJob,
        status: "printing",
        printnode_job_id: 321,
        submitted_at: "2026-07-06T10:01:01.000Z",
      };
      return { data: currentJob, error: null };
    }
    if (name === "record_printnode_state") {
      const state = options?.state ?? "done";
      currentJob = {
        ...currentJob,
        status: state === "done" ? "printed" : state === "error" || state === "expired" ? "failed" : "printing",
        last_printnode_state: state,
      };
      return { data: currentJob, error: null };
    }
    if (name === "confirm_receipt_manual_and_close") {
      return { data: { ...currentOrder, status: "closed" }, error: null };
    }
    if (name === "mark_print_job_uncertain") {
      currentJob = {
        ...currentJob,
        status: "printing",
        verification_required_at: "2026-07-06T10:02:00.000Z",
      };
      return { data: currentJob, error: null };
    }
    return { data: currentJob, error: null };
  });

  const from = vi.fn((table: string) => {
    if (table === "orders") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: currentOrder, error: null })),
      };
      return builder;
    }
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
    };
    return builder;
  });
  return { rpc, from };
}

describe("POST /api/close-table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfile.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      active: true,
      role: "cashier",
    });
    mocks.loadOrderForPrint.mockResolvedValue(order);
    mocks.getPrinterAvailability.mockResolvedValue({
      configured: true,
      available: true,
      message: "Stampante online",
      printer: {},
      reason: "available",
    });
    mocks.createPrintNodeJob.mockResolvedValue({ id: 321, recovered: false });
    mocks.findPrintNodeJobBySource.mockResolvedValue(null);
    mocks.getPrintNodeJobStates.mockResolvedValue([
      {
        printJobId: 321,
        state: "done",
        message: null,
        createTimestamp: "2026-07-06T10:01:02.000Z",
      },
    ]);
  });

  it("crea il job persistente durante la preview prima dell'effetto esterno", async () => {
    const supabase = supabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(request({ action: "prepare", orderId: order.id }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_or_create_receipt_print_job",
      { p_order_id: order.id },
    );
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(payload).toMatchObject({ closed: false, copies: 1 });
  });

  it("invia una sola copia registrata e risponde closed solo leggendo l'ordine chiuso", async () => {
    mocks.createClient.mockResolvedValue(
      supabaseMock({ currentOrder: { ...order, status: "closed" } }),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: receiptJob.idempotency_key,
        copies: 1,
        source: `Appordini print_job:${receiptJob.id}`,
      }),
    );
    expect(payload).toMatchObject({ closed: true, copies: 1 });
  });

  it("non dichiara chiuso un ordine se PrintNode ha solo accettato il job", async () => {
    mocks.getPrintNodeJobStates.mockResolvedValue([
      {
        printJobId: 321,
        state: "new",
        message: null,
        createTimestamp: "2026-07-06T10:01:02.000Z",
      },
    ]);
    mocks.createClient.mockResolvedValue(supabaseMock({ state: "new" }));

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ closed: false, outcome: "printing" });
  });

  it("persiste il job e offre fallback manuale quando la stampante è offline", async () => {
    const supabase = supabaseMock();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.getPrinterAvailability.mockResolvedValue({
      configured: true,
      available: false,
      message: "Stampante offline",
      printer: null,
      reason: "printer_offline",
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      closed: false,
      code: "printer_offline",
      manualFallbackAvailable: true,
    });
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_or_create_receipt_print_job",
      { p_order_id: order.id },
    );
  });

  it("chiude atomicamente dopo conferma manuale auditata", async () => {
    const supabase = supabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(request({
      action: "manual_confirm",
      orderId: order.id,
      jobId: receiptJob.id,
      expectedVersion: order.version,
      note: "Scontrino stampato dal browser e verificato dalla cassa",
    }));

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "confirm_receipt_manual_and_close",
      expect.objectContaining({
        p_job_id: receiptJob.id,
        p_expected_version: order.version,
      }),
    );
    expect(await response.json()).toMatchObject({ closed: true, manual: true });
  });

  it("su timeout marca l'esito incerto e non chiude", async () => {
    mocks.createClient.mockResolvedValue(supabaseMock());
    mocks.createPrintNodeJob.mockRejectedValue(
      new PrintNodeSubmissionError("request timeout", true),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ closed: false, code: "printnode_timeout" });
  });

  it("se PrintNode accetta ma il DB non conferma blocca il reinvio automatico", async () => {
    mocks.createClient.mockResolvedValue(
      supabaseMock({ recordSubmissionFails: true }),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      closed: false,
      code: "accepted_db_unconfirmed",
    });
    expect(mocks.createPrintNodeJob).toHaveBeenCalledOnce();
  });

  it("non reinvia un job printing senza id recuperabile", async () => {
    mocks.createClient.mockResolvedValue(
      supabaseMock({ job: { ...receiptJob, status: "printing" } }),
    );

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.findPrintNodeJobBySource).toHaveBeenCalledOnce();
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
  });

  it("recupera un invio tramite source senza creare un doppione", async () => {
    mocks.findPrintNodeJobBySource.mockResolvedValue({ id: 321 });
    mocks.createClient.mockResolvedValue(
      supabaseMock({
        job: { ...receiptJob, status: "printing" },
        currentOrder: { ...order, status: "closed" },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
  });

  it("non risponde closed se l'ordine viene annullato durante la stampa", async () => {
    mocks.createClient.mockResolvedValue(
      supabaseMock({ currentOrder: { ...order, status: "cancelled" } }),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.closed).toBe(false);
  });

  it("due richieste concorrenti producono un solo invio PrintNode", async () => {
    const supabase = supabaseMock({
      currentOrder: { ...order, status: "closed" },
    });
    let claimed = false;
    supabase.rpc.mockImplementation(async (name: string) => {
      if (name === "get_or_create_receipt_print_job") {
        return { data: receiptJob, error: null };
      }
      if (name === "claim_print_job") {
        if (claimed) {
          return {
            data: {
              job: { ...receiptJob, status: "printing", retry_count: 1 },
              claimed: false,
            },
            error: null,
          };
        }
        claimed = true;
        return {
          data: {
            job: { ...receiptJob, status: "printing", retry_count: 1 },
            claimed: true,
          },
          error: null,
        };
      }
      if (name === "record_printnode_submission") {
        return {
          data: {
            ...receiptJob,
            status: "printing",
            retry_count: 1,
            printnode_job_id: 321,
          },
          error: null,
        };
      }
      if (name === "record_printnode_state") {
        return {
          data: {
            ...receiptJob,
            status: "printed",
            retry_count: 1,
            printnode_job_id: 321,
          },
          error: null,
        };
      }
      return { data: receiptJob, error: null };
    });
    mocks.createClient.mockResolvedValue(supabase);

    const [first, second] = await Promise.all([
      POST(request()),
      POST(request()),
    ]);

    expect([first.status, second.status].every((status) => [200, 202].includes(status))).toBe(true);
    expect(mocks.createPrintNodeJob).toHaveBeenCalledOnce();
  });

  it.each(["error", "expired"])(
    "espone lo stato terminale PrintNode %s senza reinvio automatico",
    async (state) => {
      mocks.createClient.mockResolvedValue(
        supabaseMock({
          job: {
            ...receiptJob,
            status: "failed",
            last_printnode_state: state,
          },
        }),
      );

      const response = await POST(request());
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.code).toBe(
        state === "expired" ? "printnode_job_expired" : "printnode_job_error",
      );
      expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    },
  );
});
