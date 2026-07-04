import type { MenuItem } from "@/types/domain";

export type DropPlacement = "before" | "after";

export function reorderCategoryMenuItems(
  categoryItems: MenuItem[],
  movedItemId: string,
  targetItemId: string,
  placement: DropPlacement,
) {
  if (movedItemId === targetItemId) return categoryItems;

  const movedItem = categoryItems.find((item) => item.id === movedItemId);
  if (!movedItem) return categoryItems;

  const reordered = categoryItems.filter((item) => item.id !== movedItemId);
  const targetIndex = reordered.findIndex((item) => item.id === targetItemId);
  if (targetIndex < 0) return categoryItems;

  reordered.splice(
    placement === "after" ? targetIndex + 1 : targetIndex,
    0,
    movedItem,
  );

  return reordered.map((item, sortOrder) => ({
    ...item,
    sort_order: sortOrder,
  }));
}
