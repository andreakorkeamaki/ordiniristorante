import type { Order, RestaurantTable } from "@/types/domain";

const ACTIVE_ORDER_STATUSES = new Set([
  "draft",
  "pending_cashier",
  "confirmed",
  "in_preparation",
  "bill_requested",
]);

export interface CashierTableRow {
  table: RestaurantTable;
  activeOrder: Order | null;
  closedOrder: Order | null;
}

export function buildCashierTableRows(
  tables: RestaurantTable[],
  orders: Order[],
  currentServiceId: string | null,
): CashierTableRow[] {
  const activeByTable = new Map<string, Order>();
  const closedByTable = new Map<string, Order>();

  for (const order of orders) {
    if (
      order.order_type !== "dine_in" ||
      !order.table_id ||
      currentServiceId === null ||
      order.service_id !== currentServiceId
    ) {
      continue;
    }

    if (ACTIVE_ORDER_STATUSES.has(order.status)) {
      keepNewest(activeByTable, order.table_id, order);
      continue;
    }

    if (order.status === "closed") {
      keepNewest(closedByTable, order.table_id, order);
    }
  }

  return tables
    .filter((table) => table.active)
    .map((table) => ({
      table,
      activeOrder: activeByTable.get(table.id) ?? null,
      closedOrder: closedByTable.get(table.id) ?? null,
    }))
    .filter((row) => row.activeOrder !== null || row.closedOrder !== null)
    .sort((left, right) => {
      const activeDifference = Number(right.activeOrder !== null) - Number(left.activeOrder !== null);
      return activeDifference || left.table.table_number - right.table.table_number;
    });
}

function keepNewest(map: Map<string, Order>, tableId: string, candidate: Order) {
  const current = map.get(tableId);
  if (!current || orderTimestamp(candidate) > orderTimestamp(current)) {
    map.set(tableId, candidate);
  }
}

function orderTimestamp(order: Order) {
  return order.closed_at ?? order.updated_at ?? order.created_at;
}
