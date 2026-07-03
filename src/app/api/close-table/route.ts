import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { loadOrderForPrint } from "@/lib/load-order-for-print";
import { buildRaw80mmReceipt } from "@/lib/print-receipt-raw";
import {
  createPrintNodeJob,
  getPrinterAvailability,
  PrintNodeIdempotencyError,
  PrintNodeSubmissionError,
} from "@/lib/printnode";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderId: z.uuid(),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile?.active || !["cashier", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ordine non valido" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  }

  const order = await loadOrderForPrint(supabase, parsed.data.orderId);
  if (!order) {
    return NextResponse.json({ error: "Ordine non disponibile" }, { status: 404 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "L'ordine è annullato" }, { status: 409 });
  }
  if (order.status === "closed") {
    return NextResponse.json({ closed: true, idempotent: true });
  }
  const orderLabel = order.order_type === "takeaway" ? "Asporto" : "Tavolo";
  if (!["in_preparation", "bill_requested"].includes(order.status)) {
    return NextResponse.json(
      { error: `${orderLabel} non ancora pronto per la chiusura`, closed: false },
      { status: 409 },
    );
  }

  const availability = await getPrinterAvailability();
  if (!availability.available) {
    return NextResponse.json(
      {
        error: `${availability.message}. ${orderLabel} non chiuso`,
        closed: false,
      },
      { status: 503 },
    );
  }

  let printNodeJobId: number | null = null;
  let idempotent = false;

  try {
    const submission = await createPrintNodeJob({
      title: `SCONTRINO #${order.order_number}`,
      content: buildRaw80mmReceipt(order),
      idempotencyKey: `${order.id}:receipt`,
      copies: 1,
      source: `Appordini receipt:${order.id}`,
    });
    printNodeJobId = submission.id;
    idempotent = submission.recovered;
  } catch (error) {
    if (error instanceof PrintNodeIdempotencyError) {
      idempotent = true;
    } else {
      const outcomeUncertain =
        error instanceof PrintNodeSubmissionError && error.outcomeUncertain;
      return NextResponse.json(
        {
          error: outcomeUncertain
            ? `Esito stampa incerto: verifica la stampante. ${orderLabel} non chiuso`
            : `${error instanceof Error ? error.message : "Stampa non riuscita"}. ${orderLabel} non chiuso`,
          closed: false,
          outcome: outcomeUncertain ? "uncertain" : "failed",
        },
        { status: 503 },
      );
    }
  }

  const { error: closeError } = await supabase.rpc("close_order", {
    p_order_id: order.id,
  });
  if (closeError) {
    return NextResponse.json(
      {
        error: `Scontrino inviato, ma l’ordine non è stato chiuso: ${closeError.message}`,
        closed: false,
        printNodeJobId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    closed: true,
    copies: 1,
    printNodeJobId,
    idempotent,
  });
}
