import type { Order } from "@/types/domain";

export function getOrderLocationLabel(order: Order) {
  if (order.order_type === "takeaway") {
    return `ASPORTO · ${order.takeaway_name ?? "Cliente"}`;
  }

  const tableName = order.table?.display_name?.trim();
  return tableName
    ? `TAVOLO ${order.table?.table_number ?? "—"} · ${tableName}`
    : `TAVOLO ${order.table?.table_number ?? "—"}`;
}

export function getOrderShortLabel(order: Order) {
  return order.order_type === "takeaway"
    ? `Asporto · ${order.takeaway_name ?? "Cliente"}`
    : `Tavolo ${order.table?.table_number ?? "—"}`;
}
