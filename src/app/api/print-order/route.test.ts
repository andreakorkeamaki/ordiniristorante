import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, PrintJob } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  loadOrderForPrint: vi.fn(),
  createPrintNodeJob: vi.fn(),
  getPrinterAvailability: vi.fn(),
  getPrintNodeJobStates: vi.fn(),
  findPrintNodeJobBySource: vi.fn(),
  cancelPrintNodeJobs: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock("@/lib/load-order-for-print", () => ({
  loadOrderForPrint: mocks.loadOrderForPrint,
}));
vi.mock("@/lib/print-ticket-raw", () => ({
  PRINT_JOB_LABELS: {
    new_order: "NUOVA COMANDA",
    order_update: "AGGIORNAMENTO",
    cancellation: "ANNULLAMENTO",
    reprint: "RISTAMPA",
    receipt: "SCONTRINO",
  },
  buildRaw80mmTicket: vi.fn(() => Buffer.from("COMANDA", "ascii")),
  buildRaw80mmDepartmentTicket: vi.fn(() => Buffer.from("COMANDE DIFFERENZIATE", "ascii")),
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
    getPrinterAvailability: mocks.getPrinterAvailability,
    getPrintNodeJobStates: mocks.getPrintNodeJobStates,
    findPrintNodeJobBySource: mocks.findPrintNodeJobBySource,
    cancelPrintNodeJobs: mocks.cancelPrintNodeJobs,
    PrintNodeSubmissionError,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/print-order/route";
import { PrintNodeSubmissionError } from "@/lib/printnode";

const order = {
  id: "00000000-0000-4000-8000-000000000101",
  order_number: 101,
  status: "in_preparation",
  table_id: "00000000-0000-4000-8000-000000000201",
  created_by: "00000000-0000-4000-8000-000000000301",
  sent_to_cashier_at: new Date().toISOString(),
} as Order;

const job = {
  id: "00000000-0000-4000-8000-000000000401",
  order_id: order.id,
  job_type: "order_update",
  idempotency_key: `${order.id}:order_update:1`,
  status: "pending",
  copies: 3,
  retry_count: 0,
  attempt_number: 1,
  printnode_job_id: null,
  processing_started_at: null,
  created_at: "2026-07-06T10:00:00.000Z",
} as PrintJob;

function request() {
  return new Request("http://localhost/api/print-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.id, type: "order_update" }),
  });
}

function supabaseMock(
  initialJob: PrintJob,
  printMode: "department_split" | "legacy_three_copies" = "department_split",
) {
  let currentJob = initialJob;
  const rpc = vi.fn(async (name: string) => {
    if (name === "record_printnode_submission") {
      currentJob = {
        ...currentJob,
        status: "printing",
        printnode_job_id: 987,
      };
    }
    if (name === "record_printnode_state") {
      currentJob = { ...currentJob, status: "printed", last_printnode_state: "done" };
    }
    return { data: currentJob, error: null };
  });
  const from = vi.fn((table: string) => {
    let updateCalled = false;
    const builder = {
      select: vi.fn(() => builder),
      update: vi.fn(() => {
        updateCalled = true;
        return builder;
      }),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (table === "restaurant_settings") {
          return { data: { order_ticket_print_mode: printMode }, error: null };
        }
        return { data: null, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "orders") {
          return {
            data: {
              id: order.id,
              created_by: order.created_by,
              status: order.status,
              sent_to_cashier_at: order.sent_to_cashier_at,
              table_id: order.table_id,
            },
            error: null,
          };
        }
        if (updateCalled) {
          currentJob = {
            ...currentJob,
            status: "printing",
            retry_count: currentJob.retry_count + 1,
            processing_started_at: "2026-07-06T10:01:00.000Z",
          };
        }
        return { data: currentJob, error: null };
      }),
    };
    return builder;
  });
  return { rpc, from };
}

describe("POST /api/print-order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfile.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000302",
      role: "cashier",
      active: true,
    });
    mocks.loadOrderForPrint.mockResolvedValue(order);
    mocks.getPrinterAvailability.mockResolvedValue({
      configured: true,
      available: true,
      reason: "available",
      message: "Stampante online",
      printer: {},
    });
    mocks.createPrintNodeJob.mockResolvedValue({ id: 987, recovered: false });
    mocks.getPrintNodeJobStates.mockResolvedValue([
      {
        printJobId: 987,
        state: "done",
        message: null,
        createTimestamp: "2026-07-06T10:01:02.000Z",
      },
    ]);
    mocks.findPrintNodeJobBySource.mockResolvedValue(null);
  });

  it("invia una sola copia PrintNode con le tre comande differenziate", async () => {
    mocks.createClient.mockResolvedValue(supabaseMock(job));

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({ copies: 1, idempotencyKey: job.idempotency_key }),
    );
    expect(payload.outcome).toBe("printed");
  });

  it("mantiene tre copie PrintNode quando l'admin sceglie la modalità precedente", async () => {
    mocks.createClient.mockResolvedValue(supabaseMock(job, "legacy_three_copies"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({ copies: 3, idempotencyKey: job.idempotency_key }),
    );
  });

  it("un doppio click su un job già inviato riconcilia senza reinvio", async () => {
    mocks.createClient.mockResolvedValue(
      supabaseMock({ ...job, status: "printing", printnode_job_id: 987 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(mocks.getPrintNodeJobStates).toHaveBeenCalled();
  });

  it("un timeout incerto non crea un retry automatico", async () => {
    const supabase = supabaseMock(job);
    mocks.createClient.mockResolvedValue(supabase);
    mocks.createPrintNodeJob.mockRejectedValue(
      new PrintNodeSubmissionError("timeout", true),
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.outcome).toBe("verification_required");
    expect(mocks.createPrintNodeJob).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "mark_print_job_uncertain",
      expect.objectContaining({ p_job_id: job.id }),
    );
  });
});
