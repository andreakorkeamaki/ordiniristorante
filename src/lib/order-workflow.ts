import type { OrderStatus } from "@/types/domain";

export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "pending_cashier",
  "confirmed",
  "in_preparation",
  "bill_requested",
];

export function canEditOrder(status: OrderStatus) {
  return OPEN_ORDER_STATUSES.includes(status);
}

export function canSendOrderUpdate(status: OrderStatus) {
  return status !== "draft" && canEditOrder(status);
}
