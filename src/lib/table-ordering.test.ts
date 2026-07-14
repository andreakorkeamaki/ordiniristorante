import { describe, expect, it } from "vitest";
import { sortTablesByActivity } from "@/lib/table-ordering";
import type { RestaurantTable } from "@/types/domain";

const tables: RestaurantTable[] = [
  { id: "1", table_number: 1, display_name: null, active: true },
  { id: "2", table_number: 2, display_name: null, active: true },
  { id: "3", table_number: 3, display_name: null, active: true },
  { id: "4", table_number: 4, display_name: null, active: true },
];

describe("sortTablesByActivity", () => {
  it("porta prima i tavoli con una comanda e mantiene l'ordine numerico nei gruppi", () => {
    const result = sortTablesByActivity(tables, new Set(["4", "2"]), true);

    expect(result.map((table) => table.table_number)).toEqual([2, 4, 1, 3]);
  });

  it("mantiene l'ordine originale quando l'impostazione e disattivata", () => {
    const result = sortTablesByActivity(tables, new Set(["4", "2"]), false);

    expect(result.map((table) => table.table_number)).toEqual([1, 2, 3, 4]);
  });

  it("non modifica l'array ricevuto", () => {
    sortTablesByActivity(tables, new Set(["4", "2"]), true);

    expect(tables.map((table) => table.table_number)).toEqual([1, 2, 3, 4]);
  });
});
