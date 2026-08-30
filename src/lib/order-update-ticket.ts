import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAddedOrderItems, type AdditionActivity } from "@/lib/order-update-ticket-core";
import type { Order, PrintJob } from "@/types/domain";

export type LoadOrderAdditionSnapshotResult =
  | { ok: true; order: Order }
  | { ok: false; technicalMessage: string };

export async function loadOrderAdditionSnapshot(
  supabase: SupabaseClient,
  order: Order,
  updateJob: PrintJob,
): Promise<LoadOrderAdditionSnapshotResult> {
  const upperBoundary = updateJob.processing_started_at;
  if (!upperBoundary) {
    return {
      ok: false,
      technicalMessage: "Order update print job has no processing boundary",
    };
  }

  const previousJobResult = await supabase
    .from("print_jobs")
    .select("processing_started_at")
    .eq("order_id", order.id)
    .in("job_type", ["new_order", "order_update"])
    .not("processing_started_at", "is", null)
    .not("printnode_job_id", "is", null)
    .lt("processing_started_at", upperBoundary)
    .order("processing_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousJobResult.error) {
    return { ok: false, technicalMessage: previousJobResult.error.message };
  }

  const previousBoundary =
    (previousJobResult.data?.processing_started_at as string | null | undefined) ??
    order.sent_to_cashier_at ??
    order.created_at;

  const activitiesResult = await supabase
    .from("order_activity")
    .select("action, payload")
    .eq("order_id", order.id)
    .in("action", ["item_added", "item_quantity_changed"])
    .gt("created_at", previousBoundary)
    .lte("created_at", upperBoundary)
    .order("created_at");

  if (activitiesResult.error) {
    return { ok: false, technicalMessage: activitiesResult.error.message };
  }

  return {
    ok: true,
    order: {
      ...order,
      items: selectAddedOrderItems(
        order.items ?? [],
        (activitiesResult.data ?? []) as AdditionActivity[],
      ),
    },
  };
}
