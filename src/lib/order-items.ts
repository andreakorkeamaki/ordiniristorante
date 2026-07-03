import type { OrderItem, OrderItemExtra } from "@/types/domain";

function extraIdentity(extra: OrderItemExtra) {
  return [
    extra.extra_name_snapshot,
    extra.extra_price_snapshot,
  ].join("\u0000");
}

function normalizedExtras(extras: OrderItemExtra[]) {
  const aggregated = new Map<string, OrderItemExtra>();

  for (const extra of extras) {
    const identity = extraIdentity(extra);
    const existing = aggregated.get(identity);
    if (existing) {
      existing.quantity += extra.quantity;
      existing.total += extra.total;
    } else {
      aggregated.set(identity, { ...extra });
    }
  }

  return [...aggregated.values()].sort((left, right) =>
    extraIdentity(left).localeCompare(extraIdentity(right)),
  );
}

function itemSignature(item: OrderItem) {
  const extras = normalizedExtras(item.extras)
    .map((extra) => `${extraIdentity(extra)}\u0000${extra.quantity}`)
    .join("\u0001");

  return [
    item.menu_item_id ?? "",
    item.item_name_snapshot,
    item.item_price_snapshot,
    item.notes.trim(),
    item.preparation_area_snapshot,
    item.category_slug ?? "",
    extras,
  ].join("\u0002");
}

export function aggregateIdenticalOrderItems(items: OrderItem[]) {
  const aggregated = new Map<string, OrderItem>();

  for (const item of items) {
    const signature = itemSignature(item);
    const existing = aggregated.get(signature);

    if (!existing) {
      aggregated.set(signature, {
        ...item,
        extras: normalizedExtras(item.extras),
      });
      continue;
    }

    existing.quantity += item.quantity;
    existing.line_total += item.line_total;

    const extrasByIdentity = new Map(
      existing.extras.map((extra) => [extraIdentity(extra), extra]),
    );
    for (const extra of normalizedExtras(item.extras)) {
      const existingExtra = extrasByIdentity.get(extraIdentity(extra));
      if (existingExtra) {
        existingExtra.quantity += extra.quantity;
        existingExtra.total += extra.total;
      }
    }
  }

  return [...aggregated.values()];
}
