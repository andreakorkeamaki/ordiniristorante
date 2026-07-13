import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/auth";
import {
  buildRaw80mmServiceCloseReport,
  buildServiceCloseReportSnapshot,
} from "@/lib/service-close-report";
import {
  createPrintNodeJob,
  getPrinterAvailability,
  PrintNodeSubmissionError,
} from "@/lib/printnode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Order,
  Profile,
  RestaurantService,
  RestaurantTable,
  ServiceCloseReport,
} from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("close"),
    serviceId: z.uuid(),
    force: z.boolean().default(false),
    reason: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal("reprint"),
    serviceId: z.uuid(),
    actionKey: z.uuid(),
  }),
]);

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile?.active || !["cashier", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Archivio riepiloghi non disponibile" },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .from("service_close_reports")
    .select("*")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Riepilogo di chiusura non disponibile" },
      { status: 503 },
    );
  }
  return NextResponse.json({ report: data ? publicReport(data as ServiceCloseReport) : null });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile?.active || !["cashier", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Richiesta di chiusura servizio non valida" },
      { status: 400 },
    );
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Archivio riepiloghi non disponibile" },
      { status: 503 },
    );
  }

  if (parsed.data.action === "reprint") {
    const reportResult = await loadReport(admin, parsed.data.serviceId);
    if (!reportResult.ok) return reportResult.response;
    return dispatchReport(admin, reportResult.report, {
      actionKey: parsed.data.actionKey,
      automatic: false,
    });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Servizio dati non disponibile" },
      { status: 503 },
    );
  }

  const { data: closedData, error: closeError } = await supabase.rpc(
    "close_service",
    {
      p_service_id: parsed.data.serviceId,
      p_force: parsed.data.force,
      p_reason: parsed.data.force ? parsed.data.reason?.trim() || null : null,
    },
  );
  if (closeError || !closedData) {
    return NextResponse.json(
      { error: closeError?.message ?? "Chiusura servizio non riuscita" },
      { status: 409 },
    );
  }

  const reportResult = await getOrCreateReport(
    admin,
    closedData as RestaurantService,
    profile,
  );
  if (!reportResult.ok) {
    return NextResponse.json(
      {
        closed: true,
        error:
          "Servizio chiuso, ma il riepilogo non è stato salvato. Contatta l’amministratore prima di iniziare il prossimo servizio.",
      },
      { status: 503 },
    );
  }

  if (reportResult.report.print_status === "submitted") {
    return NextResponse.json({
      closed: true,
      report: publicReport(reportResult.report),
      print: { status: "submitted", message: "Riepilogo già inviato in stampa" },
    });
  }
  if (reportResult.report.print_status === "uncertain") {
    return NextResponse.json({
      closed: true,
      report: publicReport(reportResult.report),
      print: {
        status: "uncertain",
        message: "Stampa da verificare: controlla il foglio prima di ristampare",
      },
    });
  }

  return dispatchReport(admin, reportResult.report, {
    actionKey: null,
    automatic: true,
  });
}

async function getOrCreateReport(
  admin: SupabaseClient,
  service: RestaurantService,
  profile: Profile,
): Promise<
  | { ok: true; report: ServiceCloseReport }
  | { ok: false; response: NextResponse }
> {
  const existing = await loadReport(admin, service.id, false);
  if (existing.ok) return existing;
  if (existing.reason === "database_error") return existing;

  const ordersResult = await admin
    .from("orders")
    .select("*")
    .eq("service_id", service.id)
    .eq("status", "closed");
  if (ordersResult.error) {
    return databaseFailure("Ordini del servizio non disponibili");
  }

  const rawOrders = (ordersResult.data ?? []) as Order[];
  const tableIds = [
    ...new Set(rawOrders.map((order) => order.table_id).filter(Boolean)),
  ] as string[];
  const tablesResult = tableIds.length
    ? await admin.from("restaurant_tables").select("*").in("id", tableIds)
    : { data: [], error: null };
  if (tablesResult.error) {
    return databaseFailure("Tavoli del servizio non disponibili");
  }
  const tables = new Map(
    ((tablesResult.data ?? []) as RestaurantTable[]).map((table) => [table.id, table]),
  );
  const orders = rawOrders.map((order) => ({
    ...order,
    table: order.table_id ? tables.get(order.table_id) : undefined,
  }));
  const snapshot = buildServiceCloseReportSnapshot(service, orders);
  const insertResult = await admin
    .from("service_close_reports")
    .insert({
      ...snapshot,
      auto_idempotency_key: `${service.id}:service-close-summary`,
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (!insertResult.error && insertResult.data) {
    return { ok: true, report: insertResult.data as ServiceCloseReport };
  }

  const raced = await loadReport(admin, service.id, false);
  if (raced.ok) return raced;
  return databaseFailure(
    insertResult.error?.message ?? "Salvataggio riepilogo non riuscito",
  );
}

async function loadReport(
  admin: SupabaseClient,
  serviceId: string,
  exposeNotFound = true,
): Promise<
  | { ok: true; report: ServiceCloseReport }
  | {
      ok: false;
      reason: "not_found" | "database_error";
      response: NextResponse;
    }
> {
  const { data, error } = await admin
    .from("service_close_reports")
    .select("*")
    .eq("service_id", serviceId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: "database_error",
      response: NextResponse.json(
        { error: "Riepilogo di chiusura non disponibile" },
        { status: 503 },
      ),
    };
  }
  if (!data) {
    return {
      ok: false,
      reason: "not_found",
      response: NextResponse.json(
        { error: "Riepilogo di chiusura non trovato" },
        { status: exposeNotFound ? 404 : 503 },
      ),
    };
  }
  return { ok: true, report: data as ServiceCloseReport };
}

async function dispatchReport(
  admin: SupabaseClient,
  report: ServiceCloseReport,
  options: { actionKey: string | null; automatic: boolean },
) {
  const availability = await getPrinterAvailability();
  if (!availability.available) {
    const failed = await updateReport(admin, report, {
      print_status: "failed",
      last_print_error: availability.message,
      print_attempt_count: report.print_attempt_count + 1,
    });
    return NextResponse.json({
      closed: true,
      report: publicReport(failed ?? report),
      print: { status: "failed", message: availability.message },
    });
  }

  const idempotencyKey = options.automatic
    ? report.auto_idempotency_key
    : `${report.service_id}:service-close-summary:reprint:${options.actionKey}`;
  const source = options.automatic
    ? `Appordini service_report:${report.id}`
    : `Appordini service_report:${report.id}:reprint:${options.actionKey}`;

  try {
    const submission = await createPrintNodeJob({
      title: `${options.automatic ? "CHIUSURA" : "RISTAMPA CHIUSURA"} ${report.period.toUpperCase()} ${report.business_date}`,
      content: buildRaw80mmServiceCloseReport(report),
      idempotencyKey,
      copies: 1,
      source,
      createdAfter: report.closed_at,
    });
    const saved = await updateReport(admin, report, {
      print_status: "submitted",
      printnode_job_id: submission.id,
      print_attempt_count: report.print_attempt_count + 1,
      last_print_error: null,
      last_printed_at: new Date().toISOString(),
    });
    if (!saved) {
      return NextResponse.json(
        {
          closed: true,
          report: publicReport(report),
          print: {
            status: "uncertain",
            message: "Stampa accettata, ma salvataggio locale non confermato",
          },
        },
        { status: 202 },
      );
    }
    return NextResponse.json({
      closed: true,
      report: publicReport(saved),
      print: {
        status: "submitted",
        message: options.automatic
          ? "Riepilogo inviato in una copia"
          : "Riepilogo ristampato in una copia",
      },
    });
  } catch (error) {
    const uncertain =
      error instanceof PrintNodeSubmissionError && error.outcomeUncertain;
    const message =
      error instanceof Error ? error.message : "Invio riepilogo non riuscito";
    const saved = await updateReport(admin, report, {
      print_status: uncertain ? "uncertain" : "failed",
      print_attempt_count: report.print_attempt_count + 1,
      last_print_error: message,
    });
    return NextResponse.json(
      {
        closed: true,
        report: publicReport(saved ?? report),
        print: {
          status: uncertain ? "uncertain" : "failed",
          message: uncertain
            ? "Esito stampa incerto: verifica il foglio prima di ristampare"
            : message,
        },
      },
      { status: uncertain ? 202 : 200 },
    );
  }
}

async function updateReport(
  admin: SupabaseClient,
  report: ServiceCloseReport,
  values: Partial<ServiceCloseReport>,
) {
  const { data, error } = await admin
    .from("service_close_reports")
    .update(values)
    .eq("id", report.id)
    .select("*")
    .maybeSingle();
  return error || !data ? null : (data as ServiceCloseReport);
}

function publicReport(report: ServiceCloseReport) {
  return {
    serviceId: report.service_id,
    businessDate: report.business_date,
    period: report.period,
    total: Number(report.service_total),
    printStatus: report.print_status,
    lastPrintError: report.last_print_error,
  };
}

function databaseFailure(message: string) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status: 503 }),
  };
}
