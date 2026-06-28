import type { OrderItem, OrderStatus } from "@/types/domain";

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

export function getOrderSubmissionIssue({
  status,
  itemCount,
  covers,
  saving,
  allYouCanEat,
}: {
  status: OrderStatus;
  itemCount: number;
  covers: number;
  saving: "saved" | "saving" | "error";
  allYouCanEat: ReturnType<typeof validateAllYouCanEat>;
}) {
  if (status !== "draft") return null;
  if (saving === "saving") return "Attendi il completamento del salvataggio.";
  if (saving === "error") return "La comanda non è sincronizzata. Controlla la connessione.";
  if (itemCount === 0) return "Aggiungi almeno un prodotto prima di inviare.";

  if (allYouCanEat.active && !allYouCanEat.valid) {
    if (covers === 0) {
      return `Hai selezionato ${allYouCanEat.quantity} formule All You Can Eat: imposta ${allYouCanEat.quantity} coperti.`;
    }
    return `Le formule All You Can Eat sono ${allYouCanEat.quantity}, ma i coperti sono ${covers}. I numeri devono coincidere.`;
  }

  return null;
}
