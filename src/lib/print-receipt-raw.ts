import type { Order } from "@/types/domain";

const LINE_WIDTH = 42;
const DOUBLE_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x11]);
const NORMAL_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x00]);

function ascii(value: string) {
  return value
    .replaceAll("€", "EUR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
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

function wrap(value: string, width = LINE_WIDTH) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function buildRaw80mmReceipt(order: Order) {
  const tableName = order.table?.display_name?.trim();
  const tableLabel = tableName
    ? `${order.table?.table_number ?? "-"} - ${tableName}`
    : String(order.table?.table_number ?? "-");
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text("LA SAGRETTA"),
    NORMAL_TEXT_SIZE,
    text("SCONTRINO"),
    text(`ORDINE #${order.order_number}`),
    Buffer.from([0x1b, 0x61, 0x00]),
    text("-".repeat(LINE_WIDTH)),
    ...wrap(`TAVOLO ${tableLabel}`).map(text),
    text(
      `DATA ${new Date().toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    ),
    text(`CAMERIERE: ${order.waiter?.full_name ?? "-"}`),
    text("-".repeat(LINE_WIDTH)),
  ];

  for (const item of order.items ?? []) {
    for (const line of wrap(item.item_name_snapshot)) chunks.push(text(line));
    chunks.push(
      text(row(
        `${item.quantity} x ${money(item.item_price_snapshot)}`,
        money(item.line_total),
      )),
    );

    for (const extra of item.extras ?? []) {
      for (const line of wrap(`+ ${extra.extra_name_snapshot}`)) chunks.push(text(line));
      chunks.push(
        text(row(
          `${extra.quantity} x ${money(extra.extra_price_snapshot)}`,
          money(extra.total),
        )),
      );
    }
  }

  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(row("SUBTOTALE", money(order.subtotal))),
    text(row(
      `COPERTO ${order.cover_count} x ${money(order.cover_price_snapshot)}`,
      money(order.cover_total),
    )),
    text("=".repeat(LINE_WIDTH)),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text(`TOTALE ${money(order.total)}`),
    NORMAL_TEXT_SIZE,
    text("GRAZIE"),
    text(""),
    text(""),
    Buffer.from([0x1d, 0x56, 0x41, 0x10]),
  );

  return Buffer.concat(chunks);
}
