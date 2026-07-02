import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Order,
  OrderItem,
  Profile,
  RestaurantTable,
} from "@/types/domain";

export async function loadOrderForPrint(
  supabase: SupabaseClient,
  orderId: string,
) {
  const [orderResult, tableResult, profilesResult, linesResult] = await Promise.all([
    supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
    supabase.from("restaurant_tables").select("*"),
    supabase.from("profiles").select("id, full_name, role, active"),
    supabase
      .from("order_items")
      .select(
        "*, menu_item:menu_items(category:menu_categories(slug)), extras:order_item_extras(*)",
      )
      .eq("order_id", orderId)
      .order("created_at"),
  ]);

  if (
    orderResult.error ||
    tableResult.error ||
    profilesResult.error ||
    linesResult.error ||
    !orderResult.data
  ) {
    return null;
  }

  const rawOrder = orderResult.data as Order;
  const tables = new Map(
    ((tableResult.data ?? []) as RestaurantTable[]).map((table) => [table.id, table]),
  );
  const profiles = new Map(
    ((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]),
  );
  const items = (linesResult.data ?? []).map((row) => {
    const printableRow = row as OrderItem & {
      menu_item?: { category?: { slug?: string | null } | null } | null;
    };
    const { menu_item: menuItem, ...item } = printableRow;

    return {
      ...item,
      category_slug: menuItem?.category?.slug ?? null,
    };
  });

  return {
    ...rawOrder,
    table: tables.get(rawOrder.table_id),
    waiter: profiles.get(rawOrder.created_by),
    items,
  } satisfies Order;
}
