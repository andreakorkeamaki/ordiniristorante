import type { OrderItem } from "@/types/domain";

export function calculateTotals(items: OrderItem[], covers: number, coverPrice: number) {
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = money(items.reduce((sum, item) => sum + item.line_total, 0));
  const coverTotal = money(covers * coverPrice);
  return { subtotal, coverTotal, total: money(subtotal + coverTotal) };
}

export function validateAllYouCanEat(
  items: Pick<OrderItem, "item_name_snapshot" | "quantity">[],
  covers: number,
) {
  const quantity = items
    .filter((item) => item.item_name_snapshot.startsWith("All You Can Eat"))
    .reduce((sum, item) => sum + item.quantity, 0);

  return {
    active: quantity > 0,
    valid: quantity === 0 || (covers > 0 && quantity === covers),
    quantity,
  };
}
