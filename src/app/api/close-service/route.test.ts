import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Order,
  RestaurantService,
  ServiceCloseReport,
} from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  createPrintNodeJob: vi.fn(),
  getPrinterAvailability: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
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
    PrintNodeSubmissionError,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET, POST } from "@/app/api/close-service/route";

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

const closedOrder = {
  id: "00000000-0000-4000-8000-000000000010",
  order_number: 42,
  table_id: "00000000-0000-4000-8000-000000000020",
  service_id: service.id,
  order_type: "dine_in",
  status: "closed",
  cover_count: 4,
  total: 86,
} as Order;

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/close-service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminMock(initialReport: ServiceCloseReport | null = null) {
  let report = initialReport;
  const from = vi.fn((table: string) => {
    if (table === "orders") {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [closedOrder], error: null }).then(resolve),
      };
      return builder;
    }
    if (table === "restaurant_tables") {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(async () => ({
          data: [
            {
              id: closedOrder.table_id,
              table_number: 7,
              display_name: null,
              active: true,
            },
          ],
          error: null,
        })),
      };
      return builder;
    }

    let action: "select" | "insert" | "update" = "select";
    let inserted: Record<string, unknown> = {};
    let updated: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      insert: vi.fn((values: Record<string, unknown>) => {
        action = "insert";
        inserted = values;
        return builder;
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        action = "update";
        updated = values;
        return builder;
      }),
      single: vi.fn(async () => {
        report = {
          id: "00000000-0000-4000-8000-000000000030",
          print_status: "pending",
          printnode_job_id: null,
          print_attempt_count: 0,
          last_print_error: null,
          last_printed_at: null,
          created_at: service.closed_at!,
          updated_at: service.closed_at!,
          ...inserted,
        } as ServiceCloseReport;
        return { data: report, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (action === "update" && report) {
          report = { ...report, ...updated };
        }
        return { data: report, error: null };
      }),
    };
    return builder;
  });

  const client = { from };
  mocks.createAdminClient.mockReturnValue(client);
  return { client, getReport: () => report };
}

function savedReport(
  overrides: Partial<ServiceCloseReport> = {},
): ServiceCloseReport {
  return {
    id: "00000000-0000-4000-8000-000000000030",
    service_id: service.id,
    business_date: service.business_date,
    period: service.period,
    opened_at: service.opened_at,
    closed_at: service.closed_at!,
    forced_close: false,
    summary_rows: [
      {
        kind: "dine_in",
        label: "Tavolo 7",
        order_number: 42,
        cover_count: 4,
        total: 86,
      },
    ],
    dine_in_count: 1,
    takeaway_count: 0,
    cover_count: 4,
    dine_in_total: 86,
    takeaway_total: 0,
    service_total: 86,
    print_status: "failed",
    printnode_job_id: null,
    print_attempt_count: 1,
    auto_idempotency_key: `${service.id}:service-close-summary`,
    last_print_error: "Stampante offline",
    last_printed_at: null,
    created_by: service.opened_by,
    created_at: service.closed_at!,
    updated_at: service.closed_at!,
    ...overrides,
  };
}

describe("/api/close-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProfile.mockResolvedValue({
      id: service.opened_by,
      active: true,
      role: "cashier",
    });
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: service, error: null })),
    });
    mocks.getPrinterAvailability.mockResolvedValue({
      available: true,
      message: "Stampante online",
    });
    mocks.createPrintNodeJob.mockResolvedValue({ id: 321, recovered: false });
  });

  it("chiude il servizio, salva lo snapshot e invia una sola copia", async () => {
    const { getReport } = adminMock();
    const response = await POST(
      request({ action: "close", serviceId: service.id, force: false }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      closed: true,
      report: { total: 86, printStatus: "submitted" },
      print: { status: "submitted" },
    });
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        copies: 1,
        idempotencyKey: `${service.id}:service-close-summary`,
      }),
    );
    expect(getReport()).toMatchObject({
      dine_in_count: 1,
      cover_count: 4,
      service_total: 86,
      printnode_job_id: 321,
    });
  });

  it("chiude comunque e conserva la ristampa quando la stampante è offline", async () => {
    const { getReport } = adminMock();
    mocks.getPrinterAvailability.mockResolvedValue({
      available: false,
      message: "Stampante offline",
    });

    const response = await POST(
      request({ action: "close", serviceId: service.id, force: false }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({
      closed: true,
      report: { printStatus: "failed" },
      print: { status: "failed", message: "Stampante offline" },
    });
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(getReport()).toMatchObject({
      print_status: "failed",
      last_print_error: "Stampante offline",
    });
  });

  it("ristampa lo snapshot salvato senza richiamare la chiusura", async () => {
    const report = savedReport();
    adminMock(report);
    const actionKey = "00000000-0000-4000-8000-000000000099";

    const response = await POST(
      request({ action: "reprint", serviceId: service.id, actionKey }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createPrintNodeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        copies: 1,
        idempotencyKey: `${service.id}:service-close-summary:reprint:${actionKey}`,
      }),
    );
  });

  it("archivia il riepilogo senza stampare e senza riaprire il servizio", async () => {
    const { getReport } = adminMock(savedReport());

    const response = await POST(
      request({ action: "skip", serviceId: service.id }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      closed: true,
      report: { printStatus: "skipped" },
      print: {
        status: "skipped",
        message: "Riepilogo archiviato senza stampa",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getPrinterAvailability).not.toHaveBeenCalled();
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
    expect(getReport()).toMatchObject({
      print_status: "skipped",
      last_print_error: null,
    });
  });

  it("non archivia un riepilogo già inviato in stampa", async () => {
    const { getReport } = adminMock(
      savedReport({ print_status: "submitted", printnode_job_id: 321 }),
    );

    const response = await POST(
      request({ action: "skip", serviceId: service.id }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Il riepilogo risulta già inviato in stampa",
    });
    expect(getReport()).toMatchObject({ print_status: "submitted" });
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
  });

  it("recupera dopo refresh l'ultimo riepilogo non stampato", async () => {
    adminMock(savedReport());

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      report: { serviceId: service.id, total: 86, printStatus: "failed" },
    });
  });
});
