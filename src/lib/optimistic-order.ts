import type { QueuedOrderEdit } from "@/lib/order-edit-queue";
import type { MenuExtra, MenuItem, Order, OrderItem, PrintStatus } from "@/types/domain";

export interface OrderSnapshot {
  order: Order | null;
  items: OrderItem[];
  update_print_status: PrintStatus | null;
}

type EditIntent =
  | { type: "add"; item_id: string; menu_item_id: string; quantity: number; product: MenuItem }
  | { type: "quantity"; item_ids: string[]; delta: number }
  | { type: "remove"; item_ids: string[] }
  | { type: "extra"; item_id: string; extra_id: string; new_item_id: string; extra: MenuExtra }
  | { type: "remove_extra"; item_id: string; extra_id: string; new_item_id: string }
  | { type: "note"; item_id: string; notes: string; expected_notes: string; new_item_id: string }
  | { type: "details"; cover_count?: number; general_notes?: string; expected_general_notes?: string };

export type OrderEdit = EditIntent & {
  expected_quantity?: number;
  expected_cover_count?: number;
  expected_variants?: Record<string, { notes: string; extras: { name: string; price: number; quantity: number }[] }>;
};

export function orderItemVariant(item: OrderItem) {
  const extras = new Map<string, { name: string; price: number; quantity: number }>();
  for (const extra of item.extras) {
    const key = JSON.stringify([extra.extra_name_snapshot, extra.extra_price_snapshot]);
    const existing = extras.get(key);
    if (existing) existing.quantity += extra.quantity / item.quantity;
    else extras.set(key, { name: extra.extra_name_snapshot, price: extra.extra_price_snapshot, quantity: extra.quantity / item.quantity });
  }
  return { notes: item.notes, extras: [...extras.values()] };
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function withQuantity(item: OrderItem, quantity: number): OrderItem {
  return {
    ...item,
    quantity,
    line_total: money(item.item_price_snapshot * quantity),
    extras: item.extras.map((extra) => ({
      ...extra,
      quantity: extra.quantity / item.quantity * quantity,
      total: money(extra.total / item.quantity * quantity),
    })),
  };
}

/** Mirrors atomic server edits; authoritative prices and totals replace this projection on acknowledgement. */
export function projectOrderEdit(snapshot: OrderSnapshot, edit: OrderEdit): OrderSnapshot {
  if (!snapshot.order) return snapshot;
  let order = { ...snapshot.order };
  let items = snapshot.items.map((item) => ({ ...item, extras: item.extras.map((extra) => ({ ...extra })) }));
  if (edit.type === "add") {
    items.push({
      id: edit.item_id, order_id: order.id, menu_item_id: edit.menu_item_id,
      item_name_snapshot: edit.product.name, item_price_snapshot: edit.product.price,
      ingredients_snapshot: edit.product.ingredients, quantity: edit.quantity,
      line_total: money(edit.product.price * edit.quantity), notes: "",
      preparation_area_snapshot: edit.product.preparation_area, version: 1, extras: [],
    });
  } else if (edit.type === "quantity") {
    let remaining = edit.delta;
    items = items.flatMap((item) => {
      if (!edit.item_ids.includes(item.id) || remaining === 0) return [item];
      const delta = remaining > 0 ? remaining : Math.max(remaining, -item.quantity);
      remaining -= delta;
      return item.quantity + delta > 0 ? [withQuantity(item, item.quantity + delta)] : [];
    });
  } else if (edit.type === "remove") {
    items = items.filter((item) => !edit.item_ids.includes(item.id));
  } else if (edit.type === "details") {
    order = { ...order,
      ...(edit.cover_count !== undefined ? { cover_count: edit.cover_count } : {}),
      ...(edit.general_notes !== undefined ? { general_notes: edit.general_notes } : {}),
    };
  } else {
    const index = items.findIndex((item) => item.id === edit.item_id);
    if (index >= 0) {
      const source = items[index];
      let variant = withQuantity(source, 1);
      if (source.quantity > 1) {
        items[index] = withQuantity(source, source.quantity - 1);
        variant = { ...variant, id: edit.new_item_id, extras: variant.extras.map((extra) => ({
          ...extra, id: `${edit.new_item_id}:${extra.id}`, order_item_id: edit.new_item_id,
        })) };
        items.splice(index + 1, 0, variant);
      } else {
        items[index] = variant;
      }
      if (edit.type === "note") variant.notes = edit.notes;
      if (edit.type === "extra") {
        variant.extras.push({
          id: `${edit.new_item_id}:extra`, order_item_id: variant.id,
          extra_name_snapshot: edit.extra.name, extra_price_snapshot: edit.extra.price,
          quantity: 1, total: edit.extra.price,
        });
      }
      if (edit.type === "remove_extra") {
        variant.extras = variant.extras.filter((extra) => extra.id !== edit.extra_id && extra.id !== `${edit.new_item_id}:${edit.extra_id}`);
      }
    }
  }
  const subtotal = money(items.reduce((total, item) => total + item.line_total + item.extras.reduce((sum, extra) => sum + extra.total, 0), 0));
  const cover_total = money(order.cover_count * order.cover_price_snapshot);
  return {
    order: { ...order, subtotal, cover_total, total: money(subtotal + cover_total) },
    items,
    update_print_status: order.status !== "draft" ? "pending" : snapshot.update_print_status,
  };
}

/** Catalogue data is only for the projection, never trusted by the server. */
export function orderEditPayload(edit: OrderEdit) {
  const payload = { ...edit } as Record<string, unknown>;
  delete payload.product;
  delete payload.extra;
  return payload;
}

export function mergeOrderEdits(last: QueuedOrderEdit<OrderEdit>, next: QueuedOrderEdit<OrderEdit>): QueuedOrderEdit<OrderEdit> | null {
  const left = last.edit; const right = next.edit;
  if (left.type === "add" && right.type === "add" && left.menu_item_id === right.menu_item_id && left.quantity + right.quantity <= 999) {
    return { ...last, edit: { ...left, quantity: left.quantity + right.quantity } };
  }
  if (left.type === "quantity" && right.type === "quantity" && JSON.stringify(left.item_ids) === JSON.stringify(right.item_ids) && Math.abs(left.delta + right.delta) <= 999) {
    return { ...last, edit: { ...left, delta: left.delta + right.delta } };
  }
  if (left.type === "details" && right.type === "details" && left.cover_count !== undefined && right.cover_count !== undefined && left.general_notes === undefined && right.general_notes === undefined) {
    return { ...last, edit: { ...left, cover_count: right.cover_count } };
  }
  return null;
}
