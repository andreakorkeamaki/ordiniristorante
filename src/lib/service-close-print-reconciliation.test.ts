import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getPrintNodeJobStates: vi.fn(),
  createPrintNodeJob: vi.fn(),
}));

vi.mock("@/lib/printnode", () => ({
  getPrintNodeJobStates: mocks.getPrintNodeJobStates,
  createPrintNodeJob: mocks.createPrintNodeJob,
}));

import { reconcileServicePrintJobs } from "@/lib/service-close-print-reconciliation";

const serviceId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";

function supabaseMock() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => ({
      data: [{ id: jobId, printnode_job_id: 987 }],
      error: null,
    })),
  };
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  return { client: { from: vi.fn(() => builder), rpc }, rpc };
}

describe("service close print reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra done prima della chiusura senza creare nuove stampe", async () => {
    const { client, rpc } = supabaseMock();
    mocks.getPrintNodeJobStates.mockResolvedValue([
      {
        printJobId: 987,
        state: "done",
        message: null,
        createTimestamp: "2026-07-27T20:00:02.000Z",
      },
      {
        printJobId: 987,
        state: "client_acknowledged",
        message: null,
        createTimestamp: "2026-07-27T20:00:03.000Z",
      },
    ]);

    const summary = await reconcileServicePrintJobs(
      client as never,
      serviceId,
      actorId,
    );

    expect(summary).toEqual({ checked: 1, reconciled: 1, updateErrors: 0 });
    expect(rpc).toHaveBeenCalledWith("record_printnode_state", {
      p_job_id: jobId,
      p_state: "done",
      p_message: null,
      p_actor_id: actorId,
    });
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
  });

  it("non modifica un job che PrintNode segnala ancora non terminale", async () => {
    const { client, rpc } = supabaseMock();
    mocks.getPrintNodeJobStates.mockResolvedValue([
      {
        printJobId: 987,
        state: "sent_to_client",
        message: null,
        createTimestamp: "2026-07-27T20:00:01.000Z",
      },
    ]);

    const summary = await reconcileServicePrintJobs(
      client as never,
      serviceId,
      actorId,
    );

    expect(summary).toEqual({ checked: 1, reconciled: 0, updateErrors: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.createPrintNodeJob).not.toHaveBeenCalled();
  });
});
