import { describe, expect, it } from "vitest";
import {
  canSafelyCancelPrintJob,
  getLatestStablePrintNodeState,
  getPrintJobDisplayState,
  getStaffPrintMessage,
  shouldReconcileBeforeDispatch,
} from "@/lib/print-job-state";
import type { PrintJob } from "@/types/domain";

const baseJob: PrintJob = {
  id: "00000000-0000-4000-8000-000000000001",
  order_id: "00000000-0000-4000-8000-000000000002",
  job_type: "new_order",
  idempotency_key: "order:new_order",
  status: "printing",
  copies: 3,
  printer_target: "cashier",
  labels: [],
  retry_count: 1,
  error_message: null,
  printnode_job_id: null,
  processing_started_at: "2026-07-02T10:00:00.000Z",
  submitted_at: null,
  failed_at: null,
  last_attempt_at: "2026-07-02T10:00:00.000Z",
  manual_fallback: false,
  manually_confirmed: false,
  manual_confirmed_at: null,
  manual_confirmed_by: null,
  manual_confirmation_note: null,
  verification_required_at: null,
  last_printnode_state: null,
  last_state_checked_at: null,
  staff_message: null,
  technical_error: null,
  retry_of_job_id: null,
  attempt_number: 1,
  retry_requested_by: null,
  retry_requested_at: null,
  retry_reason: null,
  dispatch_token: null,
  dispatch_expires_at: null,
  created_at: "2026-07-02T10:00:00.000Z",
  updated_at: "2026-07-02T10:00:00.000Z",
  printed_at: null,
};

describe("print job recovery state", () => {
  it("mostra come da verificare un job printing scaduto senza ristamparlo", () => {
    expect(
      getPrintJobDisplayState(
        baseJob,
        new Date("2026-07-02T10:02:01.000Z").getTime(),
      ),
    ).toBe("verification_required");
  });

  it("mantiene persistente lo stato da verificare dopo un refresh", () => {
    expect(
      getPrintJobDisplayState({
        ...baseJob,
        verification_required_at: "2026-07-02T10:01:00.000Z",
      }),
    ).toBe("verification_required");
  });

  it("non espone la collisione UUID come messaggio principale", () => {
    const job = {
      ...baseJob,
      status: "failed" as const,
      error_message:
        "Idempotency key collision: 00000000-0000-4000-8000-000000000002:new_order",
      technical_error:
        "Idempotency key collision: 00000000-0000-4000-8000-000000000002:new_order",
      staff_message: "Richiesta già ricevuta da PrintNode: verificare il foglio",
    };
    expect(getStaffPrintMessage(job)).toBe(
      "Richiesta già ricevuta da PrintNode: verificare il foglio",
    );
  });

  it("considera annullabile solo un job sicuramente non inviato", () => {
    expect(
      canSafelyCancelPrintJob({ ...baseJob, status: "failed" }),
    ).toBe(true);
    expect(
      canSafelyCancelPrintJob({
        ...baseJob,
        status: "failed",
        printnode_job_id: 123,
      }),
    ).toBe(false);
  });

  it("riconcilia un job che ha già un id PrintNode invece di reinviarlo", () => {
    expect(
      shouldReconcileBeforeDispatch({ ...baseJob, printnode_job_id: 123 }),
    ).toBe(true);
  });

  it("usa l'ultimo stato PrintNode ricevuto", () => {
    expect(
      getLatestStablePrintNodeState([
        { state: "new", createTimestamp: "2026-07-02T10:00:00.000Z" },
        { state: "done", createTimestamp: "2026-07-02T10:00:02.000Z" },
        {
          state: "sent_to_client",
          createTimestamp: "2026-07-02T10:00:01.000Z",
        },
      ])?.state,
    ).toBe("done");
  });
});
