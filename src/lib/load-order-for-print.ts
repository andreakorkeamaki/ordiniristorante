import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Order,
  OrderItem,
  Profile,
  RestaurantTable,
} from "@/types/domain";

export type LoadOrderForPrintResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      reason: "not_found" | "database_error" | "incomplete_data";
      technicalMessage: string;
    };

export async function loadOrderForPrint(
  supabase: SupabaseClient,
  orderId: string,
): Promise<LoadOrderForPrintResult> {
  const orderResult = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderResult.error) {
    return {
      ok: false,
      reason: "database_error",
      technicalMessage: orderResult.error.message,
    };
  }
  if (!orderResult.data) {
    return {
      ok: false,
      reason: "not_found",
      technicalMessage: "Order not found",
    };
  }
  const rawOrder = orderResult.data as Order;

  const [tableResult, profileResult, linesResult] = await Promise.all([
    rawOrder.table_id
      ? supabase
          .from("restaurant_tables")
          .select("*")
          .eq("id", rawOrder.table_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("profiles")
      .select("id, full_name, role, active")
      .eq("id", rawOrder.created_by)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select(
        "*, menu_item:menu_items(category:menu_categories(name, slug, sort_order)), extras:order_item_extras(*)",
      )
      .eq("order_id", orderId)
      .order("created_at"),
  ]);

  const relatedError = tableResult.error ?? profileResult.error ?? linesResult.error;
  if (relatedError) {
    return {
      ok: false,
      reason: "database_error",
      technicalMessage: relatedError.message,
    };
  }
  if (rawOrder.table_id && !tableResult.data) {
    return {
      ok: false,
      reason: "incomplete_data",
      technicalMessage: "Order table snapshot is missing",
    };
  }

  const items = (linesResult.data ?? []).map((row) => {
    const printableRow = row as OrderItem & {
      menu_item?: {
        category?: {
          name?: string | null;
          slug?: string | null;
          sort_order?: number | null;
        } | null;
      } | null;
    };
    const { menu_item: menuItem, ...item } = printableRow;

    return {
      ...item,
      category_name: menuItem?.category?.name ?? null,
      category_slug: menuItem?.category?.slug ?? null,
      category_sort_order: menuItem?.category?.sort_order ?? null,
    };
  });

  return {
    ok: true,
    order: {
      ...rawOrder,
      table: (tableResult.data as RestaurantTable | null) ?? undefined,
      waiter: (profileResult.data as Profile | null) ?? undefined,
      items,
    } satisfies Order,
  };
}
