import { randomUUID } from "node:crypto";
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
import { createAdminClient } from "@/lib/supabase/admin";
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
    action: z.literal("reprint"),
    orderId: z.uuid(),
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

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    return failure("supabase_unreachable", 503, startedAt, {
      order_id: parsed.data.orderId,
      actor_id: profile.id,
      technical_error:
        error instanceof Error ? error.message : "Supabase server secret missing",
    });
  }

  const orderResult = await loadOrderForPrint(supabase, parsed.data.orderId);
  if (!orderResult.ok) {
    return failure(
      orderResult.reason === "database_error" ? "supabase_unreachable" : "invalid_state",
      orderResult.reason === "database_error" ? 503 : 404,
      startedAt,
      {
        order_id: parsed.data.orderId,
        actor_id: profile.id,
        technical_error: orderResult.technicalMessage,
      },
    );
  }
  const order = orderResult.order;
  const isReceiptReprint = parsed.data.action === "reprint";
  if (order.status === "closed" && !isReceiptReprint) {
    return NextResponse.json({ closed: true, idempotent: true, copies: 1 });
  }
  if (order.status === "cancelled") {
    return failure("invalid_state", 409, startedAt, {
      order_id: order.id,
      actor_id: profile.id,
      technical_error: "Order cancelled",
    });
  }
  if (isReceiptReprint && order.status !== "closed") {
    return failure("invalid_state", 409, startedAt, {
      order_id: order.id,
      actor_id: profile.id,
      technical_error: "Receipt reprint requested for an open order",
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
    parsed.data.action === "reprint"
      ? await supabase.rpc("request_receipt_reprint", {
          p_order_id: order.id,
          p_action_key: parsed.data.actionKey,
          p_reason: parsed.data.reason,
        })
      : parsed.data.action === "dispatch" && parsed.data.jobId
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
    const current = await settleReceiptOrder(supabase, order, !isReceiptReprint);
    return receiptResponse(current, job, startedAt, profile.id, {
      idempotent: true,
      reprint: isReceiptReprint,
    });
  }

  if (job.printnode_job_id) {
    job = await reconcileReceipt(admin, job, profile.id);
    const current =
      job.status === "printed"
        ? await settleReceiptOrder(supabase, order, !isReceiptReprint)
        : await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, {
      idempotent: true,
      reprint: isReceiptReprint,
    });
  }

  if (job.status === "printing") {
    const recovered = await findPrintNodeJobBySource(
      receiptSource(job.id),
      job.processing_started_at ?? job.created_at,
    ).catch(() => null);
    if (recovered && job.dispatch_token) {
      const saved = await recordSubmission(
        admin,
        job.id,
        recovered.id,
        job.dispatch_token,
        profile.id,
      );
      if (saved) job = await reconcileReceipt(admin, saved, profile.id);
      const current =
        job.status === "printed"
          ? await settleReceiptOrder(supabase, order, !isReceiptReprint)
          : await loadCurrentOrder(supabase, order.id);
      return receiptResponse(current, job, startedAt, profile.id, {
        idempotent: true,
        reprint: isReceiptReprint,
      });
    }

    await markUncertain(
      admin,
      job.id,
      job.dispatch_token,
      "Esito dello scontrino da verificare prima di qualsiasi nuovo invio",
      "Receipt printing without recoverable PrintNode id",
      profile.id,
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

  const dispatchToken = randomUUID();
  const { data: claimedData, error: claimError } = await admin.rpc(
    "claim_print_job",
    {
      p_job_id: job.id,
      p_dispatch_token: dispatchToken,
      p_actor_id: profile.id,
    },
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
    if (job.printnode_job_id) job = await reconcileReceipt(admin, job, profile.id);
    const current =
      job.status === "printed"
        ? await settleReceiptOrder(supabase, order, !isReceiptReprint)
        : await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, {
      idempotent: true,
      reprint: isReceiptReprint,
    });
  }
  if (job.printnode_job_id || job.status !== "printing") {
    const current = await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, {
      idempotent: true,
      reprint: isReceiptReprint,
    });
  }

  try {
    const { data: dispatchable, error: dispatchError } = await admin.rpc(
      "verify_print_job_dispatch",
      { p_job_id: job.id, p_dispatch_token: dispatchToken },
    );
    if (dispatchError || dispatchable !== true) {
      await releaseReceipt(
        admin,
        job.id,
        dispatchToken,
        dispatchError?.message ?? "Receipt dispatch invalidated",
        profile.id,
      );
      return failure("conflict", 409, startedAt, {
        ...context(order, job, profile.id),
        technical_error: dispatchError?.message ?? "Receipt dispatch invalidated",
      });
    }

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

    const saved = await recordSubmission(
      admin,
      job.id,
      submission.id,
      dispatchToken,
      profile.id,
    );
    if (!saved) {
      await markUncertain(
        admin,
        job.id,
        dispatchToken,
        "PrintNode ha accettato lo scontrino, ma lo stato locale non è confermato",
        `PrintNode job ${submission.id} accepted; database update failed`,
        profile.id,
      );
      return failure("accepted_db_unconfirmed", 202, startedAt, {
        ...context(order, job, profile.id),
        printnode_job_id: submission.id,
      });
    }

    job = await reconcileReceipt(admin, saved, profile.id);
    const current =
      job.status === "printed"
        ? await settleReceiptOrder(supabase, order, !isReceiptReprint)
        : await loadCurrentOrder(supabase, order.id);
    return receiptResponse(current, job, startedAt, profile.id, {
      idempotent: submission.recovered,
      reprint: isReceiptReprint,
    });
  } catch (error) {
    const technicalError =
      error instanceof Error ? error.message : "Unknown PrintNode submission error";
    const uncertain =
      error instanceof PrintNodeSubmissionError && error.outcomeUncertain;
    if (uncertain) {
      await markUncertain(
        admin,
        job.id,
        dispatchToken,
        "PrintNode potrebbe avere ricevuto lo scontrino: verificare il foglio",
        technicalError,
        profile.id,
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

    await failReceipt(
      admin,
      job.id,
      dispatchToken,
      technicalError,
      profile.id,
    );
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
  dispatchToken: string,
  actorId: string,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await supabase.rpc("record_printnode_submission", {
      p_job_id: jobId,
      p_printnode_job_id: printNodeJobId,
      p_dispatch_token: dispatchToken,
      p_actor_id: actorId,
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

async function reconcileReceipt(
  supabase: SupabaseClient,
  job: PrintJob,
  actorId: string,
) {
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
      p_actor_id: actorId,
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
  dispatchToken: string | null,
  staffMessage: string,
  technicalError: string,
  actorId: string,
) {
  if (dispatchToken) {
    await supabase.rpc("mark_print_job_uncertain", {
      p_job_id: jobId,
      p_dispatch_token: dispatchToken,
      p_staff_message: staffMessage,
      p_technical_error: technicalError,
      p_actor_id: actorId,
    });
    return;
  }

  await supabase
    .from("print_jobs")
    .update({
      status: "printing",
      verification_required_at: new Date().toISOString(),
      staff_message: staffMessage,
      technical_error: technicalError,
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "printing")
    .is("dispatch_token", null);
}

async function releaseReceipt(
  supabase: SupabaseClient,
  jobId: string,
  dispatchToken: string,
  technicalError: string,
  actorId: string,
) {
  await supabase.rpc("release_print_job", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
    p_staff_message: "Invio scontrino annullato perché lo stato è cambiato",
    p_technical_error: technicalError,
    p_actor_id: actorId,
  });
}

async function failReceipt(
  supabase: SupabaseClient,
  jobId: string,
  dispatchToken: string,
  technicalError: string,
  actorId: string,
) {
  await supabase.rpc("fail_print_job", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
    p_staff_message: "Invio dello scontrino a PrintNode non riuscito",
    p_technical_error: technicalError,
    p_actor_id: actorId,
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

function settleReceiptOrder(
  supabase: SupabaseClient,
  order: Order,
  shouldClose: boolean,
) {
  return shouldClose
    ? closeConfirmedReceipt(supabase, order)
    : loadCurrentOrder(supabase, order.id);
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
  options: { idempotent: boolean; reprint: boolean },
) {
  const closed = order?.status === "closed";
  const completed = options.reprint ? job.status === "printed" : closed;
  const outcome = options.reprint && completed
    ? "reprinted"
    : closed && !options.reprint
      ? "closed"
      : job.status;
  logReceipt("receipt_dispatch_result", startedAt, {
    order_id: job.order_id,
    print_job_id: job.id,
    printnode_job_id: job.printnode_job_id,
    actor_id: actorId,
    attempt: job.retry_count,
    outcome,
  });
  return NextResponse.json(
    {
      closed,
      reprinted: options.reprint && completed,
      job: safePrintJob(job),
      copies: job.copies,
      idempotent: options.idempotent,
      outcome,
      message: options.reprint
        ? completed
          ? "Conto finale ristampato in una copia."
          : "Ristampa del conto finale presa in carico."
        : closed
          ? "Scontrino confermato e ordine chiuso."
          : "Scontrino preso in carico. Il tavolo resterà aperto fino alla conferma.",
    },
    { status: completed ? 200 : 202 },
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
