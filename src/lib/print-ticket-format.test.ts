import { describe, expect, it } from "vitest";
import { groupOrderItemsByPrintDepartment } from "@/lib/print-ticket-format";
import type { OrderItem, PreparationArea } from "@/types/domain";

function item(
  id: string,
  name: string,
  area: PreparationArea,
  categorySlug: string,
  quantity = 1,
): OrderItem {
  return {
    id,
    order_id: "order-1",
    menu_item_id: id,
    item_name_snapshot: name,
    item_price_snapshot: 1,
    ingredients_snapshot: null,
    quantity,
    line_total: quantity,
    notes: "",
    preparation_area_snapshot: area,
    version: 1,
    category_slug: categorySlug,
    extras: [],
  };
}

describe("groupOrderItemsByPrintDepartment", () => {
  it("produce pizzeria, cucina e copia completa cassa senza copia separata bevande", () => {
    const groups = groupOrderItemsByPrintDepartment([
      item("pinsa", "Diavola", "pizzeria", "rosse"),
      item("ayce", "All You Can Eat · Adulti", "pizzeria", "all-you-can-eat", 6),
      item("suppli", "Suppli", "cucina", "antipasti", 2),
      item("acqua", "Acqua", "bar", "bevande", 4),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "COPIA PIZZERIA",
      "COPIA CUCINA",
      "COPIA COMPLETA / CASSA",
    ]);
    expect(groups[0].items.map((entry) => entry.item_name_snapshot)).toEqual([
      "Diavola",
      "All You Can Eat · Adulti",
    ]);
    expect(groups[1].items.map((entry) => entry.item_name_snapshot)).toEqual([
      "All You Can Eat · Adulti",
      "Suppli",
    ]);
    expect(groups[2].items.map((entry) => entry.item_name_snapshot)).toEqual([
      "Diavola",
      "All You Can Eat · Adulti",
      "Suppli",
      "Acqua",
    ]);
  });
});
