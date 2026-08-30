import type { OrderItem } from "@/types/domain";

export type AdditionActivity = {
  action: string;
  payload: unknown;
};

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * Rebuilds the quantities added since the preceding kitchen ticket.
 * Activity rows are the audit source of truth: current order quantities alone
 * cannot distinguish an old quantity from a newly requested one.
 */
export function selectAddedOrderItems(
  items: OrderItem[],
  activities: AdditionActivity[],
) {
  const addedByItemId = new Map<string, number>();

  for (const activity of activities) {
    const payload = payloadRecord(activity.payload);
    const itemId = typeof payload.item_id === "string" ? payload.item_id : null;
    if (!itemId) continue;

    if (activity.action === "item_added") {
      addedByItemId.set(itemId, (addedByItemId.get(itemId) ?? 0) + 1);
      continue;
    }

    if (activity.action === "item_quantity_changed") {
      const delta = Number(payload.delta);
      if (!Number.isInteger(delta)) continue;
      addedByItemId.set(itemId, (addedByItemId.get(itemId) ?? 0) + delta);
    }
  }

  return items.flatMap((item) => {
    const addedQuantity = Math.min(
      Math.max(addedByItemId.get(item.id) ?? 0, 0),
      item.quantity,
    );
    if (addedQuantity === 0) return [];

    return [{
      ...item,
      quantity: addedQuantity,
      line_total: item.item_price_snapshot * addedQuantity,
    }];
  });
}
