import type { PrintJob, PrintJobType } from "@/types/domain";

export const PRINT_VERIFICATION_TIMEOUT_MS = 2 * 60 * 1000;

export type PrintJobDisplayState =
  | "pending"
  | "printing"
  | "printed"
  | "failed"
  | "cancelled"
  | "verification_required";

export function isPrintJobStale(
  job: Pick<
    PrintJob,
    "status" | "submitted_at" | "last_attempt_at" | "processing_started_at" | "created_at"
  >,
  now = Date.now(),
) {
  if (job.status !== "printing") return false;
  const reference =
    job.submitted_at ??
    job.last_attempt_at ??
    job.processing_started_at ??
    job.created_at;
  return now - new Date(reference).getTime() >= PRINT_VERIFICATION_TIMEOUT_MS;
}

export function getPrintJobDisplayState(
  job: Pick<
    PrintJob,
    | "status"
    | "verification_required_at"
    | "submitted_at"
    | "last_attempt_at"
    | "processing_started_at"
    | "created_at"
  >,
  now = Date.now(),
): PrintJobDisplayState {
  if (
    job.status === "printing" &&
    (Boolean(job.verification_required_at) || isPrintJobStale(job, now))
  ) {
    return "verification_required";
  }
  return job.status;
}

export function getPrintJobStatusLabel(job: PrintJob, now = Date.now()) {
  const state = getPrintJobDisplayState(job, now);
  const labels: Record<PrintJobDisplayState, string> = {
    pending: "In attesa",
    printing: "In stampa",
    printed: "Stampata",
    failed: "Errore",
    cancelled: "Annullata",
    verification_required: "Da verificare",
  };
  return labels[state];
}

export function getStaffPrintMessage(job: PrintJob) {
  if (job.staff_message) return job.staff_message;
  if (job.status === "failed") {
    return job.printnode_job_id
      ? "La stampa richiede una verifica prima di riprovare"
      : "Invio alla stampante non riuscito";
  }
  if (getPrintJobDisplayState(job) === "verification_required") {
    return "Nessun aggiornamento recente: verificare il foglio prima di ristampare";
  }
  return null;
}

export function canSafelyCancelPrintJob(job: PrintJob) {
  return (
    ["pending", "failed"].includes(job.status) &&
    !job.printnode_job_id &&
    !job.submitted_at &&
    !job.verification_required_at
  );
}

export function shouldReconcileBeforeDispatch(job: PrintJob) {
  return Boolean(job.printnode_job_id);
}

export function getLatestStablePrintNodeState<T extends {
  state: string;
  createTimestamp: string;
}>(states: T[]) {
  return states.reduce<T | null>((latest, state) => {
    if (!latest) return state;
    return new Date(state.createTimestamp).getTime() >
      new Date(latest.createTimestamp).getTime()
      ? state
      : latest;
  }, null);
}

export function printJobTypeLabel(type: PrintJobType) {
  const labels: Record<PrintJobType, string> = {
    new_order: "NUOVA COMANDA",
    order_update: "AGGIORNAMENTO COMANDA",
    cancellation: "ANNULLAMENTO",
    reprint: "RISTAMPA",
  };
  return labels[type];
}
