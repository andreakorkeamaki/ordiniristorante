import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth";
import { loadOrderForPrint } from "@/lib/load-order-for-print";
import { operationalError, type OperationalErrorCode } from "@/lib/operational-errors";
import { getLatestStablePrintNodeState } from "@/lib/print-job-state";
import { buildRaw80mmReceipt } from "@/lib/print-receipt-raw";
import {
  createPrintNodeJob,
  findPrintNodeJobBySource,
  getPrinterAvailability,
  getPrintNodeJobStates,
  PrintNodeSubmissionError,
  type PrinterAvailability,
} from "@/lib/printnode";
import { createClient } from "@/lib/supabase/server";
import type { Order, PrintJob } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dispatch").default("dispatch"),
    orderId: z.uuid(),
    jobId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal("prepare"),
    orderId: z.uuid(),
  }),
  z.object({
    action: z.literal("retry"),
    orderId: z.uuid(),
    jobId: z.uuid(),
    actionKey: z.uuid(),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal("manual_confirm"),
    orderId: z.uuid(),
    jobId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    note: z.string().trim().min(10).max(500),
  }),
]);

export async function POST(request: Request) {
  const startedAt = Date.now();
  const profile = await getCurrentProfile();
  if (!profile?.active || !["cashier", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(
    rawBody && typeof rawBody === "object" && !("action" in rawBody)
      ? { ...rawBody, action: "dispatch" }
      : rawBody,
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta di chiusura non valida" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return failure("supabase_unreachable", 503, startedAt, {
      order_id: parsed.data.orderId,
      actor_id: profile.id,
      technical_error: "Supabase environment missing",
    });
  }

  const order = await loadOrderForPrint(supabase, parsed.data.orderId);
  if (!order) {
    return failure("supabase_unreachable", 503, startedAt, {
      order_id: parsed.data.orderId,
      actor_id: profile.id,
      technical_error: "Order read failed",
    });
  }
  if (order.status === "closed") {
    return NextResponse.json({ closed: true, idempotent: true, copies: 1 });
  }
  if (order.status === "cancelled") {
    return failure("invalid_state", 409, startedAt, {
      order_id: order.id,
      actor_id: profile.id,
      technical_error: "Order cancelled",
    });
  }

  if (parsed.data.action === "manual_confirm") {
    const { data, error } = await supabase.rpc("confirm_receipt_manual_and_close", {
      p_job_id: parsed.data.jobId,
      p_expected_version: parsed.data.expectedVersion,
      p_note: parsed.data.note,
    });
    if (error || !data) {
      return failure("conflict", 409, startedAt, {
        order_id: order.id,
        print_job_id: parsed.data.jobId,
        actor_id: profile.id,
        technical_error: error?.message ?? "Manual receipt confirmation returned no row",
      });
    }
    const closedOrder = data as Order;
    logReceipt("receipt_manual_confirmed", startedAt, {
      order_id: order.id,
      print_job_id: parsed.data.jobId,
      actor_id: profile.id,
      attempt: 0,
      outcome: closedOrder.status,
    });
    return NextResponse.json({
      closed: closedOrder.status === "closed",
      manual: true,
      copies: 1,
    });
  }

  const { data: receiptData, error: receiptError } =
    parsed.data.action === "dispatch" && parsed.data.jobId
      ? await supabase
          .from("print_jobs")
          .select("*")
          .eq("id", parsed.data.jobId)
          .eq("order_id", order.id)
          .eq("job_type", "receipt")
          .maybeSingle()
      : parsed.data.action === "retry"
        ? await supabase.rpc("request_receipt_retry", {
          p_job_id: parsed.data.jobId,
          p_action_key: parsed.data.actionKey,
          p_reason: parsed.data.reason,
        })
        : await supabase.rpc("get_or_create_receipt_print_job", {
            p_order_id: order.id,
          });
  if (receiptError || !receiptData) {
    return failure("conflict", 409, startedAt, {
      order_id: order.id,
      actor_id: profile.id,
      technical_error: receiptError?.message ?? "Receipt job was not created",
    });
  }
  let job = receiptData as PrintJob;

  if (parsed.data.action === "prepare") {
    logReceipt("receipt_prepared", startedAt, context(order, job, profile.id));
    return NextResponse.json({ closed: false, job, copies: 1 });
  }

  if (job.status === "printed") {
    const closeResult = await closeConfirmedReceipt(supabase, order);
    return receiptResponse(closeResult, job, startedAt, profile.id, true);
  }

  if (job.printnode_job_id) {
    job = await reconcileReceipt(supabase, job);
    const current = await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, true);
  }

  if (job.status === "printing") {
    const recovered = await findPrintNodeJobBySource(
      receiptSource(job.id),
      job.processing_started_at ?? job.created_at,
    ).catch(() => null);
    if (recovered) {
      const saved = await recordSubmission(supabase, job.id, recovered.id);
      if (saved) job = await reconcileReceipt(supabase, saved);
      const current = await loadCurrentOrder(supabase, order.id);
      return receiptResponse(current, job, startedAt, profile.id, true);
    }

    await markUncertain(
      supabase,
      job.id,
      "Esito dello scontrino da verificare prima di qualsiasi nuovo invio",
      "Receipt printing without recoverable PrintNode id",
    );
    return failure("outcome_uncertain", 202, startedAt, context(order, job, profile.id));
  }

  if (job.status === "failed") {
    const code: OperationalErrorCode =
      job.last_printnode_state === "expired"
        ? "printnode_job_expired"
        : "printnode_job_error";
    return failure(code, 409, startedAt, context(order, job, profile.id));
  }

  if (job.status === "cancelled") {
    return failure("invalid_state", 409, startedAt, context(order, job, profile.id));
  }

  const availability = await getPrinterAvailability();
  if (!availability.available) {
    return failure(availabilityCode(availability), 503, startedAt, {
      ...context(order, job, profile.id),
      technical_error: availability.message,
      job,
      manualFallbackAvailable: true,
    });
  }

  const { data: claimedData, error: claimError } = await supabase.rpc(
    "claim_print_job",
    { p_job_id: job.id },
  );
  if (claimError || !claimedData) {
    return failure("supabase_unreachable", 503, startedAt, {
      ...context(order, job, profile.id),
      technical_error: claimError?.message ?? "Receipt claim returned no row",
    });
  }
  const claimResult = claimedData as { job: PrintJob; claimed: boolean };
  job = claimResult.job;
  if (!claimResult.claimed) {
    if (job.printnode_job_id) job = await reconcileReceipt(supabase, job);
    const current = await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, true);
  }
  if (job.printnode_job_id || job.status !== "printing") {
    const current = await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, true);
  }

  try {
    const submission = await createPrintNodeJob({
      title: `SCONTRINO #${order.order_number}`,
      content: buildRaw80mmReceipt(order),
      idempotencyKey: job.idempotency_key,
      copies: job.copies,
      source: receiptSource(job.id),
      createdAfter: job.processing_started_at ?? job.created_at,
    });
    logReceipt("receipt_printnode_accepted", startedAt, {
      ...context(order, job, profile.id),
      printnode_job_id: submission.id,
      outcome: submission.recovered ? "recovered" : "accepted",
    });

    const saved = await recordSubmission(supabase, job.id, submission.id);
    if (!saved) {
      await markUncertain(
        supabase,
        job.id,
        "PrintNode ha accettato lo scontrino, ma lo stato locale non è confermato",
        `PrintNode job ${submission.id} accepted; database update failed`,
      );
      return failure("accepted_db_unconfirmed", 202, startedAt, {
        ...context(order, job, profile.id),
        printnode_job_id: submission.id,
      });
    }

    job = await reconcileReceipt(supabase, saved);
    const current = await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, submission.recovered);
  } catch (error) {
    const technicalError =
      error instanceof Error ? error.message : "Unknown PrintNode submission error";
    const uncertain =
      error instanceof PrintNodeSubmissionError && error.outcomeUncertain;
    if (uncertain) {
      await markUncertain(
        supabase,
        job.id,
        "PrintNode potrebbe avere ricevuto lo scontrino: verificare il foglio",
        technicalError,
      );
      const code =
        error instanceof Error &&
        (error.name === "TimeoutError" || technicalError.toLowerCase().includes("timeout"))
          ? "printnode_timeout"
          : "outcome_uncertain";
      return failure(code, 202, startedAt, {
        ...context(order, job, profile.id),
        technical_error: technicalError,
      });
    }

    await supabase
      .from("print_jobs")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        staff_message: "Invio dello scontrino a PrintNode non riuscito",
        technical_error: technicalError,
        error_message: technicalError,
      })
      .eq("id", job.id)
      .eq("status", "printing");
    return failure("printnode_unreachable", 503, startedAt, {
      ...context(order, job, profile.id),
      technical_error: technicalError,
    });
  }
}

async function recordSubmission(
  supabase: SupabaseClient,
  jobId: string,
  printNodeJobId: number,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await supabase.rpc("record_printnode_submission", {
      p_job_id: jobId,
      p_printnode_job_id: printNodeJobId,
    });
    if (!error && data) return data as PrintJob;
    logReceipt("receipt_submission_db_retry", Date.now(), {
      print_job_id: jobId,
      printnode_job_id: printNodeJobId,
      attempt,
      outcome: "failed",
      technical_error: error?.message,
    });
  }
  return null;
}

async function reconcileReceipt(supabase: SupabaseClient, job: PrintJob) {
  if (!job.printnode_job_id) return job;
  try {
    const states = await getPrintNodeJobStates([Number(job.printnode_job_id)]);
    const latest = getLatestStablePrintNodeState(
      states.filter((state) => state.printJobId === Number(job.printnode_job_id)),
    );
    if (!latest) return job;
    const { data, error } = await supabase.rpc("record_printnode_state", {
      p_job_id: job.id,
      p_state: latest.state,
      p_message: latest.message,
    });
    if (error || !data) return job;
    return data as PrintJob;
  } catch (error) {
    logReceipt("receipt_reconciliation_failed", Date.now(), {
      print_job_id: job.id,
      printnode_job_id: job.printnode_job_id,
      attempt: job.retry_count,
      outcome: "unchanged",
      technical_error: error instanceof Error ? error.message : "Unknown error",
    });
    return job;
  }
}

async function markUncertain(
  supabase: SupabaseClient,
  jobId: string,
  staffMessage: string,
  technicalError: string,
) {
  await supabase.rpc("mark_print_job_uncertain", {
    p_job_id: jobId,
    p_staff_message: staffMessage,
    p_technical_error: technicalError,
  });
}

async function closeConfirmedReceipt(
  supabase: SupabaseClient,
  order: Order,
) {
  const { data } = await supabase.rpc("close_order", {
    p_order_id: order.id,
    p_expected_version: order.version,
  });
  return (data as Order | null) ?? loadCurrentOrder(supabase, order.id);
}

async function loadCurrentOrder(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  return data as Order | null;
}

function receiptResponse(
  order: Order | null,
  job: PrintJob,
  startedAt: number,
  actorId: string,
  idempotent: boolean,
) {
  const closed = order?.status === "closed";
  logReceipt("receipt_dispatch_result", startedAt, {
    order_id: job.order_id,
    print_job_id: job.id,
    printnode_job_id: job.printnode_job_id,
    actor_id: actorId,
    attempt: job.retry_count,
    outcome: closed ? "closed" : job.status,
  });
  return NextResponse.json(
    {
      closed,
      job: safePrintJob(job),
      copies: job.copies,
      idempotent,
      outcome: closed ? "closed" : job.status,
      message: closed
        ? "Scontrino confermato e ordine chiuso."
        : "Scontrino preso in carico. Il tavolo resterà aperto fino alla conferma.",
    },
    { status: closed ? 200 : 202 },
  );
}

function failure(
  code: OperationalErrorCode,
  status: number,
  startedAt: number,
  details: Record<string, unknown>,
) {
  const guidance = operationalError(code);
  const responseDetails = { ...details };
  delete responseDetails.technical_error;
  if (responseDetails.job && typeof responseDetails.job === "object") {
    responseDetails.job = safePrintJob(
      responseDetails.job as unknown as PrintJob,
    );
  }
  logReceipt("receipt_operation_failed", startedAt, {
    ...details,
    outcome: code,
  });
  return NextResponse.json(
    {
      error: guidance.message,
      code,
      action: guidance.action,
      closed: false,
      ...responseDetails,
    },
    { status },
  );
}

function safePrintJob(job: PrintJob) {
  const safeJob = { ...job } as Record<string, unknown>;
  delete safeJob.technical_error;
  delete safeJob.error_message;
  return safeJob;
}

function availabilityCode(
  availability: PrinterAvailability,
): OperationalErrorCode {
  if (availability.reason === "not_configured") return "printnode_not_configured";
  if (availability.reason === "timeout") return "printnode_timeout";
  if (availability.reason === "computer_disconnected") return "computer_disconnected";
  if (availability.reason === "printer_offline") return "printer_offline";
  return "printnode_unreachable";
}

function receiptSource(jobId: string) {
  return `Appordini print_job:${jobId}`;
}

function context(order: Order, job: PrintJob, actorId: string) {
  return {
    order_id: order.id,
    print_job_id: job.id,
    printnode_job_id: job.printnode_job_id,
    actor_id: actorId,
    attempt: job.retry_count,
    copies: job.copies,
  };
}

function logReceipt(
  event: string,
  startedAt: number,
  details: Record<string, unknown>,
) {
  console.info(
    JSON.stringify({
      scope: "receipt_printing",
      event,
      timestamp: new Date().toISOString(),
      duration_ms: Math.max(0, Date.now() - startedAt),
      ...details,
    }),
  );
}
