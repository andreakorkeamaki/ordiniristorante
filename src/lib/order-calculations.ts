import type { OrderItem, OrderStatus } from "@/types/domain";

export function calculateTotals(items: OrderItem[], covers: number, coverPrice: number) {
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = money(items.reduce((sum, item) => sum + item.line_total, 0));
  const coverTotal = money(covers * coverPrice);
  return { subtotal, coverTotal, total: money(subtotal + coverTotal) };
}

export function aggregateMenuItemQuantities(
  items: Pick<OrderItem, "menu_item_id" | "quantity">[],
) {
  return items.reduce<Record<string, number>>((quantities, item) => {
    if (item.menu_item_id) {
      quantities[item.menu_item_id] =
        (quantities[item.menu_item_id] ?? 0) + item.quantity;
    }
    return quantities;
  }, {});
}

export function getOrderSubmissionIssue({
  status,
  itemCount,
  saving,
}: {
  status: OrderStatus;
  itemCount: number;
  saving: "saved" | "saving" | "error";
}) {
  if (status !== "draft") return null;
  if (saving === "saving") return "Attendi il completamento del salvataggio.";
  if (saving === "error") return "La comanda non è sincronizzata. Controlla la connessione.";
  if (itemCount === 0) return "Aggiungi almeno un prodotto prima di inviare.";

  return null;
}
