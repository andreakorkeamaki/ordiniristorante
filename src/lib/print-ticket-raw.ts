import type { Order, OrderItem, PrintJobType } from "@/types/domain";
import { getOrderLocationLabel } from "@/lib/order-display";
import {
  aggregateIdenticalOrderItems,
  groupOrderItemsByCategory,
} from "@/lib/order-items";

export const PRINT_JOB_LABELS: Record<PrintJobType, string> = {
  new_order: "NUOVA COMANDA",
  order_update: "AGGIORNAMENTO COMANDA",
  cancellation: "ANNULLAMENTO",
  reprint: "RISTAMPA",
  receipt: "SCONTRINO",
};

const LINE_WIDTH = 24;
const DOUBLE_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x11]);
const NORMAL_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x00]);
const CUT = Buffer.from([0x1d, 0x56, 0x41, 0x10]);
const PIZZA_CATEGORY_SLUGS = new Set(["rosse", "bianche", "speciali"]);

function ascii(value: string) {
  return value
    .replaceAll("€", "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrap(value: string, width = LINE_WIDTH) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function text(value: string) {
  return Buffer.from(`${ascii(value)}\n`, "ascii");
}

function money(value: number) {
  return `${Number(value).toFixed(2).replace(".", ",")} EUR`;
}

function row(left: string, right: string) {
  const safeLeft = ascii(left);
  const safeRight = ascii(right);
  const available = Math.max(1, LINE_WIDTH - safeRight.length - 1);
  return `${safeLeft.slice(0, available).padEnd(available)} ${safeRight}`;
}

export function getPinsaPrintPrefix(categorySlug: string | null | undefined) {
  if (categorySlug === "rosse") return "R";
  if (categorySlug === "bianche") return "B";
  if (categorySlug === "speciali") return "S";
  return "";
}

function isPizzaItem(item: OrderItem) {
  return PIZZA_CATEGORY_SLUGS.has(item.category_slug ?? "");
}

function isKitchenItem(item: OrderItem) {
  return (
    !isPizzaItem(item) &&
    item.preparation_area_snapshot !== "bar" &&
    item.preparation_area_snapshot !== "cassa"
  );
}

function orderTime(order: Order) {
  return new Date(order.sent_to_cashier_at ?? order.created_at).toLocaleTimeString(
    "it-IT",
    {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function tableValue(order: Order) {
  if (order.order_type === "takeaway") {
    return order.takeaway_name ? `Asporto - ${order.takeaway_name}` : "Asporto";
  }
  return order.table?.table_number ? String(order.table.table_number) : "-";
}

function addBottomMeta(chunks: Buffer[], order: Order) {
  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(`Tavolo: ${tableValue(order)}`),
    text(`Orario ordine: ${orderTime(order)}`),
  );
}

function addHeader(
  chunks: Buffer[],
  order: Order,
  jobType: PrintJobType,
  copyLabel: string,
) {
  const locationLabel = getOrderLocationLabel(order).replace(" · ", " - ");
  chunks.push(
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text("LA SAGRETTA"),
    text(copyLabel),
    text(PRINT_JOB_LABELS[jobType]),
    text(`COMANDA #${order.order_number}`),
    Buffer.from([0x1b, 0x61, 0x00]),
    text("-".repeat(LINE_WIDTH)),
    ...wrap(locationLabel).map(text),
    ...(order.order_type === "takeaway" && order.takeaway_pickup_at
      ? [text(
          `RITIRO ${new Date(order.takeaway_pickup_at).toLocaleTimeString("it-IT", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        )]
      : []),
    text("-".repeat(LINE_WIDTH)),
  );
}

function addPreparationLines(chunks: Buffer[], items: OrderItem[]) {
  if (!items.length) {
    chunks.push(text("NESSUN PRODOTTO"));
    return;
  }

  for (const item of items) {
    const prefix = getPinsaPrintPrefix(item.category_slug);
    const line = prefix
      ? `${item.quantity}${prefix} ${item.item_name_snapshot}`
      : `${item.quantity} ${item.item_name_snapshot}`;
    for (const wrappedLine of wrap(line)) chunks.push(text(wrappedLine));

    for (const extra of item.extras ?? []) {
      for (const wrappedLine of wrap(`  + ${extra.extra_name_snapshot}`)) {
        chunks.push(text(wrappedLine));
      }
    }
    if (item.notes) {
      for (const wrappedLine of wrap(`  Nota: ${item.notes}`)) {
        chunks.push(text(wrappedLine));
      }
    }
  }
}

function addCompleteLines(chunks: Buffer[], order: Order) {
  const items = aggregateIdenticalOrderItems(order.items ?? []);
  if (!items.length) {
    chunks.push(text("NESSUN PRODOTTO"));
    return;
  }

  for (const item of items) {
    for (const line of wrap(item.item_name_snapshot)) chunks.push(text(line));
    chunks.push(
      text(row(
        `${item.quantity} x ${money(item.item_price_snapshot)}`,
        money(item.line_total),
      )),
    );

    for (const extra of item.extras ?? []) {
      for (const line of wrap(`+ ${extra.extra_name_snapshot}`)) {
        chunks.push(text(line));
      }
      chunks.push(
        text(row(
          `${extra.quantity} x ${money(extra.extra_price_snapshot)}`,
          money(extra.total),
        )),
      );
    }
    if (item.notes) {
      for (const line of wrap(`Nota: ${item.notes}`)) chunks.push(text(line));
    }
  }

  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(row("SUBTOTALE", money(order.subtotal))),
    ...(order.order_type === "dine_in"
      ? [text(row(
          `COPERTO ${order.cover_count} x ${money(order.cover_price_snapshot)}`,
          money(order.cover_total),
        ))]
      : []),
    text("=".repeat(LINE_WIDTH)),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text(`TOTALE ${money(order.total)}`),
    NORMAL_TEXT_SIZE,
    Buffer.from([0x1b, 0x61, 0x00]),
  );
}

function addGeneralNotes(chunks: Buffer[], order: Order) {
  if (!order.general_notes) return;
  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(order.order_type === "takeaway" ? "NOTE ORDINE:" : "NOTE TAVOLO:"),
  );
  for (const line of wrap(order.general_notes)) chunks.push(text(line));
}

function buildDepartmentCopy(
  order: Order,
  jobType: PrintJobType,
  copyLabel: string,
  renderLines: (chunks: Buffer[]) => void,
) {
  const chunks: Buffer[] = [];
  addHeader(chunks, order, jobType, copyLabel);
  renderLines(chunks);
  addGeneralNotes(chunks, order);
  addBottomMeta(chunks, order);
  chunks.push(
    Buffer.from([0x1b, 0x61, 0x01]),
    text(copyLabel),
    text(""),
    text(""),
    CUT,
  );
  return Buffer.concat(chunks);
}

export function buildRaw80mmDepartmentTicket(order: Order, jobType: PrintJobType) {
  const items = order.items ?? [];
  const pizzaItems = items.filter(isPizzaItem);
  const kitchenItems = items.filter(isKitchenItem);

  return Buffer.concat([
    buildDepartmentCopy(order, jobType, "COPIA PIZZERIA", (chunks) => {
      addPreparationLines(chunks, pizzaItems);
    }),
    buildDepartmentCopy(order, jobType, "COPIA CUCINA", (chunks) => {
      addPreparationLines(chunks, kitchenItems);
    }),
    buildDepartmentCopy(order, jobType, "COPIA COMPLETA / CASSA", (chunks) => {
      addCompleteLines(chunks, order);
    }),
  ]);
}

export function buildRaw80mmTicket(order: Order, jobType: PrintJobType) {
  const locationLabel = getOrderLocationLabel(order).replace(" · ", " - ");
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text("LA SAGRETTA"),
    text(PRINT_JOB_LABELS[jobType]),
    text(`COMANDA #${order.order_number}`),
    Buffer.from([0x1b, 0x61, 0x00]),
    text("-".repeat(LINE_WIDTH)),
    ...wrap(locationLabel).map(text),
    ...(order.order_type === "takeaway" && order.takeaway_pickup_at
      ? [text(
          `RITIRO ${new Date(order.takeaway_pickup_at).toLocaleTimeString("it-IT", {
            timeZone: "Europe/Rome",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        )]
      : []),
    text(
      `ORA ${new Date(order.sent_to_cashier_at ?? order.created_at).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    ),
    text("-".repeat(LINE_WIDTH)),
  ];

  for (const category of groupOrderItemsByCategory(order.items ?? [])) {
    chunks.push(
      Buffer.from([0x1b, 0x61, 0x01]),
      ...wrap(category.label.toUpperCase()).map(text),
      Buffer.from([0x1b, 0x61, 0x00]),
    );

    for (const item of category.items) {
      const prefix = getPinsaPrintPrefix(item.category_slug);
      const itemName = prefix
        ? `${prefix} ${item.item_name_snapshot}`
        : item.item_name_snapshot;
      for (const line of wrap(`${item.quantity}x ${itemName}`)) {
        chunks.push(text(line));
      }
      if (item.notes) {
        for (const line of wrap(`  NOTA: ${item.notes}`)) chunks.push(text(line));
      }
      for (const extra of item.extras ?? []) {
        for (const line of wrap(`  + ${extra.quantity}x ${extra.extra_name_snapshot}`)) {
          chunks.push(text(line));
        }
      }
    }
    chunks.push(text(""));
  }

  if (order.general_notes) {
    chunks.push(
      text("-".repeat(LINE_WIDTH)),
      text(order.order_type === "takeaway" ? "NOTE ORDINE:" : "NOTE TAVOLO:"),
    );
    for (const line of wrap(order.general_notes)) chunks.push(text(line));
  }

  addBottomMeta(chunks, order);

  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    Buffer.from([0x1b, 0x61, 0x01]),
    text(PRINT_JOB_LABELS[jobType]),
    text(""),
    text(""),
    CUT,
  );

  return Buffer.concat(chunks);
}
