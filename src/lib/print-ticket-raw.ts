import type { Order, PrintJobType } from "@/types/domain";

export const PRINT_JOB_LABELS: Record<PrintJobType, string> = {
  new_order: "NUOVO ORDINE",
  order_update: "AGGIORNAMENTO",
  cancellation: "ANNULLAMENTO",
  reprint: "RISTAMPA",
};

const LINE_WIDTH = 48;

function ascii(value: string) {
  return value
    .replaceAll("€", "EUR")
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

export function buildRaw80mmTicket(order: Order, jobType: PrintJobType) {
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    Buffer.from([0x1d, 0x21, 0x11]),
    text("LA SAGRETTA"),
    Buffer.from([0x1d, 0x21, 0x00]),
    text(PRINT_JOB_LABELS[jobType]),
    text(`COMANDA #${order.order_number}`),
    Buffer.from([0x1b, 0x61, 0x00]),
    text("-".repeat(LINE_WIDTH)),
    text(`TAVOLO ${order.table?.table_number ?? "-"}`),
    text(
      `ORA ${new Date(order.sent_to_cashier_at ?? order.created_at).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    ),
    text(`CAMERIERE: ${order.waiter?.full_name ?? "-"}`),
    text("-".repeat(LINE_WIDTH)),
  ];

  for (const item of order.items ?? []) {
    for (const line of wrap(`${item.quantity}x ${item.item_name_snapshot}`)) {
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

  if (order.general_notes) {
    chunks.push(text("-".repeat(LINE_WIDTH)), text("NOTE TAVOLO:"));
    for (const line of wrap(order.general_notes)) chunks.push(text(line));
  }

  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(`COPERTI: ${order.cover_count}`),
    text(`TOTALE: EUR ${Number(order.total).toFixed(2)}`),
    Buffer.from([0x1b, 0x61, 0x01]),
    text(PRINT_JOB_LABELS[jobType]),
    text(""),
    text(""),
    Buffer.from([0x1d, 0x56, 0x41, 0x10]),
  );

  return Buffer.concat(chunks);
}

