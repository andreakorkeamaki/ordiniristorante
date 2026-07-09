import {
  aggregatePreparationOrderItems,
  PREPARATION_AREA_LABELS,
  PREPARATION_AREA_ORDER,
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

  return PREPARATION_AREA_ORDER.map((area) => ({
    area,
    label: PREPARATION_AREA_LABELS[area],
    items: aggregated.filter((item) => {
      if (area === "pizzeria") {
        return item.preparation_area_snapshot === "pizzeria" || isAyceItem(item);
      }
      if (area === "cucina") {
        return item.preparation_area_snapshot === "cucina" || isAyceItem(item);
      }
      return item.preparation_area_snapshot === area;
    }),
  })).filter((group) => group.items.length > 0);
}
