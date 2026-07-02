import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { getInitialPrintDecision } from "@/lib/automatic-print-policy";
import { loadOrderForPrint } from "@/lib/load-order-for-print";
import { canSendOrderUpdate } from "@/lib/order-workflow";
import {
  cancelPrintNodeJobs,
  createPrintNodeJob,
  getPrinterAvailability,
  getPrintNodeJobStates,
  PrintNodeSubmissionError,
} from "@/lib/printnode";
import { buildRaw80mmTicket, PRINT_JOB_LABELS } from "@/lib/print-ticket-raw";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Order,
  PrintJob,
} from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderId: z.uuid(),
  type: z.enum(["new_order", "order_update", "cancellation", "reprint"]),
});

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
  if (!(await requireCashier())) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  }

  const availability = await getPrinterAvailability();

  if (availability.configured) {
    const { data: printingJobs } = await supabase
      .from("print_jobs")
      .select("id, printnode_job_id")
      .eq("status", "printing")
      .not("printnode_job_id", "is", null);

    const localJobs = printingJobs ?? [];
    const ids = localJobs
      .map((job) => Number(job.printnode_job_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);

    if (ids.length) {
      try {
        const states = await getPrintNodeJobStates(ids);
        const latest = new Map<number, (typeof states)[number]>();
        for (const state of states) {
          const current = latest.get(state.printJobId);
          if (
            !current ||
            new Date(state.createTimestamp).getTime() > new Date(current.createTimestamp).getTime()
          ) {
            latest.set(state.printJobId, state);
          }
        }

        for (const job of localJobs) {
          const state = latest.get(Number(job.printnode_job_id));
          if (!state) continue;

          if (state.state === "done") {
            await supabase.rpc("mark_print_job_delivered", { p_job_id: job.id });
          } else if (state.state === "error" || state.state === "expired") {
            await supabase
              .from("print_jobs")
              .update({
                status: "failed",
                error_message: state.message ?? `PrintNode: ${state.state}`,
                failed_at: new Date().toISOString(),
              })
              .eq("id", job.id);
          }
        }
      } catch {
        // The availability response still gives the cashier a usable manual fallback.
      }
    }
  }

  return NextResponse.json(availability, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const profile = await requireActiveProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta di stampa non valida" }, { status: 400 });
  }

  const sessionClient = await createClient();
  if (!sessionClient) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  }

  const { orderId, type } = parsed.data;
  const isWaiter = profile.role === "waiter";

  if (isWaiter && !["new_order", "order_update"].includes(type)) {
    return NextResponse.json(
      { error: "Il cameriere può stampare soltanto la comanda e i suoi aggiornamenti" },
      { status: 403 },
    );
  }

  const supabase = sessionClient;
  const targetOrder =
    ["new_order", "order_update"].includes(type)
      ? await getOrderForAutomaticPrint(supabase, orderId)
      : null;

  if (isWaiter) {
    if (!targetOrder || targetOrder.created_by !== profile.id) {
      return NextResponse.json({ error: "Comanda non disponibile" }, { status: 404 });
    }
  }

  if (type === "new_order") {
    if (!targetOrder) {
      return NextResponse.json({ error: "Comanda non disponibile" }, { status: 404 });
    }

    const decision = getInitialPrintDecision(profile, targetOrder);
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

    if (targetOrder.status === "draft") {
      const { error } = await sessionClient.rpc("send_order_to_cashier", {
        p_order_id: orderId,
      });
      if (error) {
        const currentOrder = await getOrderForAutomaticPrint(supabase, orderId);
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

  if (
    type === "order_update" &&
    (!targetOrder || !canSendOrderUpdate(targetOrder.status))
  ) {
    return NextResponse.json(
      { error: "La comanda non può inviare aggiornamenti in questo stato" },
      { status: 409 },
    );
  }

  if (type === "reprint") {
    const { error } = await sessionClient.rpc("request_reprint", { p_order_id: orderId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: existingJob, error: jobError } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("order_id", orderId)
    .eq("job_type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError || !existingJob) {
    return NextResponse.json(
      { error: jobError?.message ?? "Job di stampa non disponibile" },
      { status: 404 },
    );
  }

  const job = existingJob as PrintJob;
  if (job.status === "printing" || job.status === "printed" || job.status === "cancelled") {
    return NextResponse.json(
      isWaiter
        ? { printStatus: job.status, idempotent: true, orderAccepted: true }
        : { job, idempotent: true, orderAccepted: true },
    );
  }
  if (isWaiter && job.status === "failed") {
    return NextResponse.json(
      {
        error: job.error_message ?? "Stampa non riuscita: interviene la cassa",
        printStatus: job.status,
        orderAccepted: true,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: claimedJob, error: claimError } = await supabase
    .from("print_jobs")
    .update({
      status: "printing",
      processing_started_at: now,
      last_attempt_at: now,
      retry_count: job.retry_count + 1,
      failed_at: null,
      error_message: null,
      manual_fallback: false,
    })
    .eq("id", job.id)
    .in("status", isWaiter ? ["pending"] : ["pending", "failed"])
    .select("*")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 400 });
  }
  if (!claimedJob) {
    return NextResponse.json(
      isWaiter
        ? { printStatus: job.status, idempotent: true, orderAccepted: true }
        : { job, idempotent: true, orderAccepted: true },
    );
  }

  try {
    if (type === "cancellation") {
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

    const availability = await getPrinterAvailability();
    if (!availability.available) throw new Error(availability.message);

    const order = await loadOrderForPrint(supabase, orderId);
    if (!order) throw new Error("Ordine non disponibile");

    const printNodeJobId = await createPrintNodeJob({
      title: `${PRINT_JOB_LABELS[type]} #${order.order_number}`,
      content: buildRaw80mmTicket(order, type),
      idempotencyKey: job.idempotency_key,
    });

    const { data: savedJob, error: saveError } = await supabase
      .from("print_jobs")
      .update({
        printnode_job_id: printNodeJobId,
        submitted_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (saveError) throw saveError;
    return NextResponse.json(
      isWaiter
        ? { printStatus: savedJob.status, orderAccepted: true }
        : {
            job: savedJob,
            printer: availability.printer,
            orderAccepted: true,
          },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invio a PrintNode fallito";
    const outcomeUncertain =
      error instanceof PrintNodeSubmissionError && error.outcomeUncertain;

    await supabase.from("print_jobs").update(
      outcomeUncertain
        ? {
            error_message:
              "Esito stampa incerto: verificare la stampante prima di ristampare",
          }
        : {
            status: "failed",
            error_message: message,
            failed_at: new Date().toISOString(),
          },
    ).eq("id", job.id);

    return NextResponse.json(
      {
        error: outcomeUncertain
          ? "PrintNode non ha confermato l'esito: verificare la stampante"
          : message,
        fallback: "manual",
        ...(!isWaiter && { jobId: job.id }),
        orderAccepted: true,
        outcome: outcomeUncertain ? "uncertain" : "failed",
      },
      { status: 503 },
    );
  }
}

async function getOrderForAutomaticPrint(supabase: SupabaseClient, orderId: string) {
  const { data } = await supabase
    .from("orders")
    .select("id, created_by, status, sent_to_cashier_at")
    .eq("id", orderId)
    .maybeSingle();

  return data as Pick<
    Order,
    "id" | "created_by" | "status" | "sent_to_cashier_at"
  > | null;
}
