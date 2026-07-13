import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { getInitialPrintDecision } from "@/lib/automatic-print-policy";
import { getLatestStablePrintNodeState } from "@/lib/print-job-state";
import { loadOrderForPrint } from "@/lib/load-order-for-print";
import { canSendOrderUpdate } from "@/lib/order-workflow";
import {
  cancelPrintNodeJobs,
  createPrintNodeJob,
  findPrintNodeJobBySource,
  getPrinterAvailability,
  getPrintNodeJobStates,
  PrintNodeSubmissionError,
} from "@/lib/printnode";
import {
  buildRaw80mmDepartmentTicket,
  buildRaw80mmTicket,
  PRINT_JOB_LABELS,
} from "@/lib/print-ticket-raw";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Order,
  OrderTicketPrintMode,
  PrintJob,
  PrintJobType,
  Profile,
} from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    orderId: z.uuid(),
    type: z.enum(["new_order", "order_update", "cancellation", "reprint"]),
    operation: z.enum(["dispatch", "retry"]).default("dispatch"),
    jobId: z.uuid().optional(),
    actionKey: z.uuid().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === "retry" && (!value.jobId || !value.actionKey)) {
      context.addIssue({
        code: "custom",
        message: "Il retry richiede job e chiave azione",
      });
    }
    if (value.type === "reprint" && value.operation === "dispatch" && !value.actionKey) {
      context.addIssue({
        code: "custom",
        message: "La ristampa richiede una chiave azione",
      });
    }
  });

type BasicOrder = Pick<
  Order,
  "id" | "created_by" | "status" | "sent_to_cashier_at" | "table_id"
>;

class PrintPreparationError extends Error {
  constructor(
    readonly reason: "database_unreachable" | "invalid_data" | "dispatch_invalidated",
    message: string,
  ) {
    super(message);
    this.name = "PrintPreparationError";
  }
}

async function requireCashier() {
  const profile = await getCurrentProfile();
  if (!profile?.active || !["cashier", "admin"].includes(profile.role)) {
    return null;
  }
  return profile;
}

async function requireActiveProfile() {
  const profile = await getCurrentProfile();
  return profile?.active ? profile : null;
}

export async function GET() {
  const profile = await requireCashier();
  if (!profile) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  }

  const admin = getPrintAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Stampa server non configurata" },
      { status: 503 },
    );
  }

  const availability = await getPrinterAvailability();
  let reconciled = 0;

  if (availability.configured) {
    const unresolvedJobs = await loadAllUnresolvedPrintJobs(supabase);

    reconciled = await reconcilePrintJobs(admin, unresolvedJobs, profile.id);
  }

  await admin.rpc("flag_stale_print_jobs", {
    p_minutes: 2,
    p_actor_id: profile.id,
  });

  logPrintEvent("print_queue_reconciled", {
    actor_id: profile.id,
    reconciled,
  });

  return NextResponse.json(
    { ...availability, reconciled },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const profile = await requireActiveProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta di stampa non valida" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  }

  const admin = getPrintAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Stampa server non configurata" },
      { status: 503 },
    );
  }

  const input = parsed.data;
  const isWaiter = profile.role === "waiter";
  if (
    isWaiter &&
    (input.operation === "retry" ||
      !["new_order", "order_update", "reprint"].includes(input.type))
  ) {
    return NextResponse.json(
      { error: "Il cameriere non può eseguire questa operazione di stampa" },
      { status: 403 },
    );
  }

  const targetOrder = await getOrderForAutomaticPrint(supabase, input.orderId);
  if (
    !targetOrder ||
    (isWaiter && input.type !== "reprint" && targetOrder.created_by !== profile.id)
  ) {
    return NextResponse.json({ error: "Comanda non disponibile" }, { status: 404 });
  }

  const validationResponse = await prepareOrderForPrint(
    supabase,
    profile,
    targetOrder,
    input.type,
  );
  if (validationResponse) return validationResponse;

  const jobResult = await getOrCreatePrintJob(supabase, input, profile);
  if ("response" in jobResult) return jobResult.response;
  let job = jobResult.job;

  const context = {
    order_id: input.orderId,
    table_id: targetOrder.table_id,
    print_job_id: job.id,
    idempotency_key: job.idempotency_key,
    attempt_number: job.attempt_number ?? job.retry_count + 1,
    attempt: job.attempt_number ?? job.retry_count + 1,
    printnode_job_id: job.printnode_job_id,
    request_started_at_ms: requestStartedAt,
    copies: job.copies,
  };

  if (job.printnode_job_id) {
    const reconciled = await reconcilePrintJob(admin, job, profile.id);
    job = reconciled ?? job;
    logPrintEvent("print_dispatch_reused_existing_submission", {
      ...context,
      printnode_job_id: job.printnode_job_id,
      status: job.status,
    });

    if (job.status === "failed") {
      return NextResponse.json(
        {
          error: "PrintNode ha segnalato un errore. Verifica il job prima di creare un nuovo tentativo.",
          job,
          idempotent: true,
          outcome: "retry_required",
          orderAccepted: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      job,
      idempotent: true,
      outcome: job.status === "printed" ? "printed" : "already_submitted",
      orderAccepted: true,
    });
  }

  if (job.status === "printing") {
    const recovered = await recoverSubmissionBySource(admin, job, profile.id);
    if (recovered) {
      job = (await reconcilePrintJob(admin, recovered, profile.id)) ?? recovered;
      return NextResponse.json({
        job,
        idempotent: true,
        recovered: true,
        outcome: job.status === "printed" ? "printed" : "already_submitted",
        orderAccepted: true,
      });
    }

    await markJobUncertain(
      admin,
      job.id,
      job.dispatch_token,
      "Invio già avviato: verificare la stampante prima di ristampare",
      "Job in stato printing senza printnode_job_id recuperabile",
      profile.id,
    );
    return NextResponse.json(
      {
        job,
        idempotent: true,
        outcome: "verification_required",
        message: "La richiesta è già in corso e non è stata inviata di nuovo.",
        orderAccepted: true,
      },
      { status: 202 },
    );
  }

  if (job.status === "printed" || job.status === "cancelled") {
    return NextResponse.json({
      job,
      idempotent: true,
      outcome: job.status,
      orderAccepted: true,
    });
  }

  if (job.status === "failed") {
    return NextResponse.json(
      {
        error: "Questo tentativo è fallito. Usa “Riprova stampa” per creare un nuovo tentativo tracciato.",
        job,
        outcome: "retry_required",
        orderAccepted: true,
      },
      { status: 409 },
    );
  }

  const dispatchToken = randomUUID();
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_print_job",
    {
      p_job_id: job.id,
      p_dispatch_token: dispatchToken,
      p_actor_id: profile.id,
    },
  );

  if (claimError) {
    return NextResponse.json({ error: "Impossibile avviare il job di stampa" }, { status: 400 });
  }
  const claimResult = claimData as { job: PrintJob; claimed: boolean } | null;
  if (!claimResult?.claimed) {
    const current = await loadPrintJob(supabase, job.id);
    return NextResponse.json({
      job: current ?? job,
      idempotent: true,
      outcome: "already_claimed",
      orderAccepted: true,
    });
  }
  job = claimResult.job;

  try {
    const orderResult = await loadOrderForPrint(supabase, input.orderId);
    if (!orderResult.ok) {
      throw new PrintPreparationError(
        orderResult.reason === "database_error"
          ? "database_unreachable"
          : "invalid_data",
        orderResult.technicalMessage,
      );
    }
    const order = orderResult.order;
    if (job.copies !== 3) {
      throw new PrintPreparationError(
        "invalid_data",
        `Metadati copie non validi per la comanda: attese 3, trovate ${job.copies}`,
      );
    }

    const ticketType = await resolveTicketType(supabase, job, input.type);
    const printMode = await loadOrderTicketPrintMode(supabase);
    const content =
      printMode === "department_split"
        ? buildRaw80mmDepartmentTicket(order, ticketType)
        : buildRaw80mmTicket(order, ticketType);
    const printNodeCopies = printMode === "department_split" ? 1 : job.copies;

    if (input.type === "cancellation" && !job.retry_of_job_id) {
      await cancelEarlierPrintNodeJobs(supabase, input.orderId);
    }

    const availability = await getPrinterAvailability();
    if (!availability.available) throw new Error(availability.message);

    const { data: dispatchable, error: dispatchError } = await admin.rpc(
      "verify_print_job_dispatch",
      { p_job_id: job.id, p_dispatch_token: dispatchToken },
    );
    if (dispatchError || dispatchable !== true) {
      throw new PrintPreparationError(
        "dispatch_invalidated",
        dispatchError?.message ?? "Ordine annullato o servizio chiuso prima dell'invio",
      );
    }

    const source = printNodeSource(job.id);
    const submission = await createPrintNodeJob({
      title: `${PRINT_JOB_LABELS[ticketType]} #${order.order_number}`,
      content,
      idempotencyKey: job.idempotency_key,
      copies: printNodeCopies,
      source,
      createdAfter: job.processing_started_at ?? job.created_at,
    });

    logPrintEvent("printnode_submission_accepted", {
      ...context,
      printnode_job_id: submission.id,
      recovered_from_printnode: submission.recovered,
      ticket_print_mode: printMode,
      printnode_copies: printNodeCopies,
      sent_at: new Date().toISOString(),
    });

    const savedJob = await recordSubmissionWithRetry(
      admin,
      job.id,
      submission.id,
      dispatchToken,
      profile.id,
    );
    if (!savedJob) {
      await markJobUncertain(
        admin,
        job.id,
        dispatchToken,
        "PrintNode ha accettato la stampa, ma lo stato locale non è stato aggiornato",
        `PrintNode job ${submission.id} accettato; update database fallito`,
        profile.id,
      );
      logPrintEvent("printnode_submission_database_update_failed", {
        ...context,
        printnode_job_id: submission.id,
        database_update: "failed",
      });
      return NextResponse.json(
        {
          job: { ...job, printnode_job_id: submission.id },
          message:
            "PrintNode ha accettato la stampa. Non ristampare: verifica il foglio e conferma manualmente se necessario.",
          outcome: "accepted_state_pending",
          orderAccepted: true,
        },
        { status: 202 },
      );
    }

    const reconciled = await reconcilePrintJob(admin, savedJob, profile.id);
    return NextResponse.json({
      job: reconciled ?? savedJob,
      printer: availability.printer,
      recovered: submission.recovered,
      outcome: reconciled?.status === "printed" ? "printed" : "submitted",
      orderAccepted: true,
    });
  } catch (error) {
    const technicalMessage =
      error instanceof Error ? error.message : "Invio a PrintNode fallito";

    if (error instanceof PrintPreparationError) {
      if (error.reason === "database_unreachable") {
        await releasePrintJob(
          admin,
          job.id,
          dispatchToken,
          "Dati comanda temporaneamente non disponibili",
          technicalMessage,
          profile.id,
        );
        return NextResponse.json(
          {
            error: "Supabase non raggiungibile. La stampa non è stata inviata e resta in coda.",
            jobId: job.id,
            orderAccepted: true,
            outcome: "database_unreachable",
          },
          { status: 503 },
        );
      }

      if (error.reason === "dispatch_invalidated") {
        await releasePrintJob(
          admin,
          job.id,
          dispatchToken,
          "Invio annullato perché ordine o servizio sono cambiati",
          technicalMessage,
          profile.id,
        );
        return NextResponse.json(
          {
            error: "La stampa non è stata inviata perché l’ordine o il servizio sono cambiati.",
            jobId: job.id,
            orderAccepted: true,
            outcome: "dispatch_invalidated",
          },
          { status: 409 },
        );
      }

      await failPrintJob(
        admin,
        job.id,
        dispatchToken,
        "Dati della comanda non validi per la stampa",
        technicalMessage,
        profile.id,
      );
      return NextResponse.json(
        {
          error: "La comanda contiene dati incompleti e non è stata inviata alla stampante.",
          jobId: job.id,
          orderAccepted: true,
          outcome: "invalid_print_data",
        },
        { status: 409 },
      );
    }

    const outcomeUncertain =
      error instanceof PrintNodeSubmissionError && error.outcomeUncertain;

    if (outcomeUncertain) {
      await markJobUncertain(
        admin,
        job.id,
        dispatchToken,
        "PrintNode ha già ricevuto o potrebbe aver ricevuto la richiesta: verificare il foglio",
        technicalMessage,
        profile.id,
      );
      logPrintEvent("printnode_submission_uncertain", {
        ...context,
        error: technicalMessage,
      });
      return NextResponse.json(
        {
          error:
            "La richiesta non è stata inviata di nuovo. Verifica la stampante prima di usare “Riprova stampa”.",
          jobId: job.id,
          orderAccepted: true,
          outcome: "verification_required",
        },
        { status: 202 },
      );
    }

    await failPrintJob(
      admin,
      job.id,
      dispatchToken,
      "Invio alla stampante non riuscito",
      technicalMessage,
      profile.id,
    );

    logPrintEvent("printnode_submission_failed", {
      ...context,
      error: technicalMessage,
      database_update: "attempted",
    });
    return NextResponse.json(
      {
        error: "Invio alla stampante non riuscito. Controlla i dettagli prima di riprovare.",
        jobId: job.id,
        orderAccepted: true,
        outcome: "failed",
      },
      { status: 503 },
    );
  }
}

async function prepareOrderForPrint(
  supabase: SupabaseClient,
  profile: Profile,
  order: BasicOrder,
  type: PrintJobType,
) {
  const isWaiter = profile.role === "waiter";
  if (type === "new_order") {
    const decision = getInitialPrintDecision(profile, order);
    if (decision === "not-owner") {
      return NextResponse.json({ error: "Comanda non disponibile" }, { status: 404 });
    }
    if (decision === "invalid-status") {
      return NextResponse.json(
        { error: "Questa comanda non può avviare una nuova stampa" },
        { status: 409 },
      );
    }
    if (decision === "submission-too-old") {
      return NextResponse.json(
        { error: "La stampa iniziale di questa comanda deve essere gestita dalla cassa" },
        { status: 403 },
      );
    }

    if (order.status === "draft") {
      const { error } = await supabase.rpc("send_order_to_cashier", {
        p_order_id: order.id,
      });
      if (error) {
        const currentOrder = await getOrderForAutomaticPrint(supabase, order.id);
        if (
          !currentOrder ||
          (isWaiter && currentOrder.created_by !== profile.id) ||
          currentOrder.status !== "pending_cashier"
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
    }
  }

  if (type === "order_update" && !canSendOrderUpdate(order.status)) {
    return NextResponse.json(
      { error: "La comanda non può inviare aggiornamenti in questo stato" },
      { status: 409 },
    );
  }
  return null;
}

async function getOrCreatePrintJob(
  supabase: SupabaseClient,
  input: z.infer<typeof bodySchema>,
  profile: Profile,
): Promise<{ job: PrintJob } | { response: NextResponse }> {
  if (input.operation === "retry") {
    if (!["cashier", "admin"].includes(profile.role)) {
      return { response: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) };
    }
    const { data, error } = await supabase.rpc("request_print_retry", {
      p_job_id: input.jobId,
      p_action_key: input.actionKey,
      p_reason: input.reason ?? "Ristampa forzata dopo verifica in cassa",
    });
    if (error || !data) {
      return {
        response: NextResponse.json(
          { error: error?.message ?? "Impossibile creare il tentativo di ristampa" },
          { status: 400 },
        ),
      };
    }
    return { job: data as PrintJob };
  }

  if (input.type === "reprint") {
    const { data, error } = await supabase.rpc("request_reprint", {
      p_order_id: input.orderId,
      p_action_key: input.actionKey,
      p_reason: input.reason ?? "Ristampa richiesta dai tavoli",
    });
    if (error || !data) {
      return {
        response: NextResponse.json(
          { error: error?.message ?? "Impossibile creare la ristampa" },
          { status: 400 },
        ),
      };
    }
    return { job: data as PrintJob };
  }

  let query = supabase
    .from("print_jobs")
    .select("*")
    .eq("order_id", input.orderId)
    .eq("job_type", input.type)
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.type !== "order_update") query = query.is("retry_of_job_id", null);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return {
      response: NextResponse.json(
        { error: error?.message ?? "Job di stampa non disponibile" },
        { status: 404 },
      ),
    };
  }
  return { job: data as PrintJob };
}

async function reconcilePrintJob(
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
    if (error) {
      logPrintEvent("printnode_state_database_update_failed", {
        print_job_id: job.id,
        printnode_job_id: job.printnode_job_id,
        state: latest.state,
        error: error.message,
      });
      return job;
    }
    return data as PrintJob;
  } catch (error) {
    logPrintEvent("printnode_state_lookup_failed", {
      print_job_id: job.id,
      printnode_job_id: job.printnode_job_id,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    });
    return job;
  }
}

async function reconcilePrintJobs(
  supabase: SupabaseClient,
  jobs: PrintJob[],
  actorId: string,
) {
  const ids = jobs
    .map((job) => Number(job.printnode_job_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return 0;

  try {
    const states = await getPrintNodeJobStates(ids);
    const latestById = new Map<number, (typeof states)[number]>();
    for (const state of states) {
      const current = latestById.get(state.printJobId);
      if (
        !current ||
        new Date(state.createTimestamp).getTime() >
          new Date(current.createTimestamp).getTime()
      ) {
        latestById.set(state.printJobId, state);
      }
    }

    let updatedCount = 0;
    for (const job of jobs) {
      const latest = latestById.get(Number(job.printnode_job_id));
      if (!latest) continue;
      const { error } = await supabase.rpc("record_printnode_state", {
        p_job_id: job.id,
        p_state: latest.state,
        p_message: latest.message,
        p_actor_id: actorId,
      });
      if (!error) updatedCount += 1;
    }
    return updatedCount;
  } catch (error) {
    logPrintEvent("printnode_batch_state_lookup_failed", {
      print_job_count: jobs.length,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    });
    return 0;
  }
}

async function loadAllUnresolvedPrintJobs(supabase: SupabaseClient) {
  const pageSize = 500;
  const jobs: PrintJob[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("print_jobs")
      .select("*")
      .eq("status", "printing")
      .not("printnode_job_id", "is", null)
      .order("created_at")
      .range(offset, offset + pageSize - 1);
    if (error) {
      logPrintEvent("print_queue_database_read_failed", {
        offset,
        error: error.message,
      });
      return jobs;
    }
    const page = (data ?? []) as PrintJob[];
    jobs.push(...page);
    if (page.length < pageSize) return jobs;
  }
}

async function recoverSubmissionBySource(
  supabase: SupabaseClient,
  job: PrintJob,
  actorId: string,
) {
  const recovered = await findPrintNodeJobBySource(
    printNodeSource(job.id),
    job.processing_started_at ?? job.created_at,
  ).catch(() => null);
  if (!recovered || !job.dispatch_token) return null;
  return recordSubmissionWithRetry(
    supabase,
    job.id,
    Number(recovered.id),
    job.dispatch_token,
    actorId,
  );
}

async function recordSubmissionWithRetry(
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
    logPrintEvent("printnode_submission_database_update_retry", {
      print_job_id: jobId,
      printnode_job_id: printNodeJobId,
      database_attempt: attempt,
      error: error?.message,
    });
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  return null;
}

async function markJobUncertain(
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

async function releasePrintJob(
  supabase: SupabaseClient,
  jobId: string,
  dispatchToken: string,
  staffMessage: string,
  technicalError: string,
  actorId: string,
) {
  await supabase.rpc("release_print_job", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
    p_staff_message: staffMessage,
    p_technical_error: technicalError,
    p_actor_id: actorId,
  });
}

async function failPrintJob(
  supabase: SupabaseClient,
  jobId: string,
  dispatchToken: string,
  staffMessage: string,
  technicalError: string,
  actorId: string,
) {
  await supabase.rpc("fail_print_job", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
    p_staff_message: staffMessage,
    p_technical_error: technicalError,
    p_actor_id: actorId,
  });
}

async function cancelEarlierPrintNodeJobs(supabase: SupabaseClient, orderId: string) {
  const { data: priorJobs } = await supabase
    .from("print_jobs")
    .select("printnode_job_id")
    .eq("order_id", orderId)
    .neq("job_type", "cancellation")
    .not("printnode_job_id", "is", null);
  const priorIds = (priorJobs ?? [])
    .map((priorJob) => Number(priorJob.printnode_job_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  await cancelPrintNodeJobs(priorIds);
}

async function resolveTicketType(
  supabase: SupabaseClient,
  job: PrintJob,
  fallback: PrintJobType,
): Promise<PrintJobType> {
  let current = job;
  const visited = new Set<string>();
  while (current.retry_of_job_id && !visited.has(current.retry_of_job_id)) {
    visited.add(current.retry_of_job_id);
    const parent = await loadPrintJob(supabase, current.retry_of_job_id);
    if (!parent) break;
    current = parent;
  }
  return current.job_type === "reprint" ? fallback : current.job_type;
}

async function loadPrintJob(supabase: SupabaseClient, jobId: string) {
  const { data } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  return data as PrintJob | null;
}

async function loadOrderTicketPrintMode(
  supabase: SupabaseClient,
): Promise<OrderTicketPrintMode> {
  const { data, error } = await supabase
    .from("restaurant_settings")
    .select("order_ticket_print_mode")
    .single();
  if (error) {
    throw new PrintPreparationError("database_unreachable", error.message);
  }
  if (!data?.order_ticket_print_mode) {
    throw new PrintPreparationError(
      "invalid_data",
      "Modalità di stampa non configurata",
    );
  }
  return data?.order_ticket_print_mode === "legacy_three_copies"
    ? "legacy_three_copies"
    : "department_split";
}

function getPrintAdminClient() {
  try {
    return createAdminClient();
  } catch (error) {
    logPrintEvent("print_admin_client_unavailable", {
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    });
    return null;
  }
}

async function getOrderForAutomaticPrint(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from("orders")
    .select("id, created_by, status, sent_to_cashier_at, table_id")
    .eq("id", orderId)
    .maybeSingle();
  return data as BasicOrder | null;
}

function printNodeSource(jobId: string) {
  return `Appordini print_job:${jobId}`;
}

function logPrintEvent(event: string, details: Record<string, unknown>) {
  const startedAt =
    typeof details.request_started_at_ms === "number"
      ? details.request_started_at_ms
      : null;
  const safeDetails = { ...details };
  delete safeDetails.request_started_at_ms;
  console.info(
    JSON.stringify({
      scope: "order_printing",
      event,
      timestamp: new Date().toISOString(),
      ...(startedAt === null ? {} : { duration_ms: Date.now() - startedAt }),
      ...safeDetails,
    }),
  );
}
