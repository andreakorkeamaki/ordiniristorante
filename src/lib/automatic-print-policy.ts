import type { AppRole, Order } from "@/types/domain";

type InitialPrintOrder = Pick<
  Order,
  "created_by" | "status" | "sent_to_cashier_at"
>;

export type WaiterInitialPrintDecision =
  | "allowed"
  | "not-owner"
  | "invalid-status"
  | "submission-too-old";

export function getInitialPrintDecision(
  profile: { id: string; role: AppRole },
  order: InitialPrintOrder,
  now = Date.now(),
): WaiterInitialPrintDecision {
  if (profile.role !== "waiter") {
    return ["draft", "pending_cashier", "confirmed"].includes(order.status)
      ? "allowed"
      : "invalid-status";
  }

  return getWaiterInitialPrintDecision(profile.id, order, now);
}

export function getWaiterInitialPrintDecision(
  waiterId: string,
  order: InitialPrintOrder,
  now = Date.now(),
): WaiterInitialPrintDecision {
  if (order.created_by !== waiterId) return "not-owner";
  if (!["draft", "pending_cashier"].includes(order.status)) {
    return "invalid-status";
  }
  if (order.status === "draft") return "allowed";
  if (!order.sent_to_cashier_at) return "submission-too-old";

  const sentAt = new Date(order.sent_to_cashier_at).getTime();
  if (!Number.isFinite(sentAt) || now - sentAt > 15 * 60 * 1000) {
    return "submission-too-old";
  }
  return "allowed";
}
