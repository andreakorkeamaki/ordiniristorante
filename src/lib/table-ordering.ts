import type { RestaurantTable } from "@/types/domain";

export function sortTablesByActivity(
  tables: readonly RestaurantTable[],
  activeTableIds: ReadonlySet<string>,
  activeFirst: boolean,
) {
  if (!activeFirst) return [...tables];

  return [...tables].sort((left, right) => {
    const activityDifference =
      Number(activeTableIds.has(right.id)) - Number(activeTableIds.has(left.id));

    return activityDifference || left.table_number - right.table_number;
  });
}
