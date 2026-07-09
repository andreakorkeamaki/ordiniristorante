import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import {
  createPrintNodeJob,
  getPrinterAvailability,
  PrintNodeSubmissionError,
} from "@/lib/printnode";
import {
  buildRaw80mmDepartmentTicket,
  buildRaw80mmTicket,
  PRINT_JOB_LABELS,
} from "@/lib/print-ticket-raw";
import { buildSamplePrintOrder } from "@/lib/print-test-order";
import type { OrderTicketPrintMode } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["department_split", "legacy_three_copies"]).default("department_split"),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta di prova non valida" }, { status: 400 });
  }

  const availability = await getPrinterAvailability();
  if (!availability.available) {
    return NextResponse.json(
      { error: availability.message, reason: availability.reason },
      { status: 503 },
    );
  }

  const mode = parsed.data.mode;
  const order = buildSamplePrintOrder();
  const content =
    mode === "department_split"
      ? buildRaw80mmDepartmentTicket(order, "new_order")
      : buildRaw80mmTicket(order, "new_order");
  const actionId = randomUUID();

  try {
    const submission = await createPrintNodeJob({
      title: `${PRINT_JOB_LABELS.new_order} PROVA #${order.order_number}`,
      content,
      idempotencyKey: actionId,
      copies: printCopies(mode),
      source: `Appordini test_print:${actionId}`,
      createdAfter: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      printNodeJobId: submission.id,
      recovered: submission.recovered,
      mode,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invio prova di stampa non riuscito";
    return NextResponse.json(
      {
        error: message,
        uncertain:
          error instanceof PrintNodeSubmissionError
            ? error.outcomeUncertain
            : false,
      },
      { status: error instanceof PrintNodeSubmissionError ? 502 : 500 },
    );
  }
}

function printCopies(mode: OrderTicketPrintMode) {
  return mode === "department_split" ? 1 : 3;
}
