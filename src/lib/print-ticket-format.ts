import {
  aggregatePreparationOrderItems,
  type PreparationAreaGroup,
} from "@/lib/order-items";
import type { OrderItem } from "@/types/domain";

export function isAyceItem(item: OrderItem) {
  return (
    item.category_slug === "all-you-can-eat" ||
    /all\s*you\s*can\s*eat/i.test(item.item_name_snapshot)
  );
}

export function formatPrintItemName(item: OrderItem) {
  if (!isAyceItem(item)) return item.item_name_snapshot;

  const suffix = item.item_name_snapshot.match(/\b(adulti|bambini)\b/i)?.[1];
  if (!suffix) return "AYCE";
  return `AYCE ${suffix[0].toUpperCase()}${suffix.slice(1).toLowerCase()}`;
}

export function formatPrintCategoryLabel(label: string) {
  return /all\s*you\s*can\s*eat/i.test(label) ? "AYCE" : label;
}

export function groupOrderItemsByPrintDepartment(
  items: OrderItem[],
): PreparationAreaGroup[] {
  const aggregated = aggregatePreparationOrderItems(items);
  const pizzaItems = aggregated.filter(
    (item) => item.preparation_area_snapshot === "pizzeria" || isAyceItem(item),
  );
  const kitchenItems = aggregated.filter(
    (item) => item.preparation_area_snapshot === "cucina" || isAyceItem(item),
  );

  return [
    {
      area: "pizzeria",
      label: "COPIA PIZZERIA",
      items: pizzaItems,
    },
    {
      area: "cucina",
      label: "COPIA CUCINA",
      items: kitchenItems,
    },
    {
      area: "cassa",
      label: "COPIA COMPLETA / CASSA",
      items: aggregated,
    },
  ];
}
