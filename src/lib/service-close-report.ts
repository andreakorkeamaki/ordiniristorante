import type {
  Order,
  RestaurantService,
  ServiceCloseReport,
  ServiceCloseSummaryRow,
} from "@/types/domain";

const LINE_WIDTH = 42;
const DOUBLE_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x11]);
const NORMAL_TEXT_SIZE = Buffer.from([0x1d, 0x21, 0x00]);

export type ServiceCloseReportSnapshot = Pick<
  ServiceCloseReport,
  | "service_id"
  | "business_date"
  | "period"
  | "opened_at"
  | "closed_at"
  | "forced_close"
  | "summary_rows"
  | "dine_in_count"
  | "takeaway_count"
  | "cover_count"
  | "dine_in_total"
  | "takeaway_total"
  | "service_total"
>;

export function buildServiceCloseReportSnapshot(
  service: RestaurantService,
  orders: Order[],
): ServiceCloseReportSnapshot {
  if (!service.closed_at) {
    throw new Error("Il riepilogo richiede un servizio chiuso");
  }

  const closedOrders = orders.filter(
    (order) => order.service_id === service.id && order.status === "closed",
  );
  const dineInGroups = new Map<string, ServiceCloseSummaryRow>();
  const takeawayRows: ServiceCloseSummaryRow[] = [];

  for (const order of closedOrders) {
    const total = roundMoney(Number(order.total));
    if (order.order_type === "takeaway") {
      takeawayRows.push({
        kind: "takeaway",
        label: order.takeaway_name?.trim() || "Asporto",
        order_number: order.order_number,
        cover_count: 0,
        total,
      });
      continue;
    }

    const groupKey = order.table_id ?? `order:${order.id}`;
    const label = order.table
      ? order.table.display_name?.trim() || `Tavolo ${order.table.table_number}`
      : `Tavolo ordine #${order.order_number}`;
    const current = dineInGroups.get(groupKey);
    dineInGroups.set(groupKey, {
      kind: "dine_in",
      label,
      order_number: current?.order_number ?? order.order_number,
      cover_count: (current?.cover_count ?? 0) + Number(order.cover_count),
      total: roundMoney((current?.total ?? 0) + total),
    });
  }

  const dineInRows = [...dineInGroups.values()].sort(compareDineInRows);
  takeawayRows.sort((left, right) =>
    (left.order_number ?? 0) - (right.order_number ?? 0),
  );
  const dineInTotal = roundMoney(
    dineInRows.reduce((total, row) => total + row.total, 0),
  );
  const takeawayTotal = roundMoney(
    takeawayRows.reduce((total, row) => total + row.total, 0),
  );

  return {
    service_id: service.id,
    business_date: service.business_date,
    period: service.period,
    opened_at: service.opened_at,
    closed_at: service.closed_at,
    forced_close: Boolean(service.forced_close),
    summary_rows: [...dineInRows, ...takeawayRows],
    dine_in_count: dineInRows.length,
    takeaway_count: takeawayRows.length,
    cover_count: dineInRows.reduce((total, row) => total + row.cover_count, 0),
    dine_in_total: dineInTotal,
    takeaway_total: takeawayTotal,
    service_total: roundMoney(dineInTotal + takeawayTotal),
  };
}

export function buildRaw80mmServiceCloseReport(
  report: ServiceCloseReportSnapshot,
) {
  const dineInRows = report.summary_rows.filter((row) => row.kind === "dine_in");
  const takeawayRows = report.summary_rows.filter(
    (row) => row.kind === "takeaway",
  );
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text("LA SAGRETTA"),
    NORMAL_TEXT_SIZE,
    text("RIEPILOGO FINE SERVIZIO"),
    text(`${periodLabel(report.period)} - ${formatDate(report.business_date)}`),
    text(`${formatTime(report.opened_at)} - ${formatTime(report.closed_at)}`),
    ...(report.forced_close ? [text("*** CHIUSURA FORZATA ***")] : []),
    Buffer.from([0x1b, 0x61, 0x00]),
  ];

  appendSection(chunks, "TAVOLI", dineInRows, true);
  appendSection(chunks, "ASPORTI", takeawayRows, false);

  chunks.push(
    text("-".repeat(LINE_WIDTH)),
    text(row("TAVOLI SERVITI", String(report.dine_in_count))),
    text(row("COPERTI TOTALI", String(report.cover_count))),
    text(row("ASPORTI", String(report.takeaway_count))),
    text(row("TOTALE SALA", money(report.dine_in_total))),
    text(row("TOTALE ASPORTI", money(report.takeaway_total))),
    text("=".repeat(LINE_WIDTH)),
    Buffer.from([0x1b, 0x61, 0x01]),
    DOUBLE_TEXT_SIZE,
    text(`TOTALE ${money(report.service_total)}`),
    NORMAL_TEXT_SIZE,
    text(""),
    text(""),
    Buffer.from([0x1d, 0x56, 0x41, 0x10]),
  );

  return Buffer.concat(chunks);
}

function appendSection(
  chunks: Buffer[],
  title: string,
  rows: ServiceCloseSummaryRow[],
  showCovers: boolean,
) {
  if (!rows.length) return;
  chunks.push(text("-".repeat(LINE_WIDTH)), text(title));
  for (const entry of rows) {
    const left = showCovers
      ? `${entry.label} - ${entry.cover_count} cop.`
      : `#${entry.order_number ?? "-"} ${entry.label}`;
    chunks.push(text(row(left, money(entry.total))));
  }
}

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
  return `${roundMoney(value).toFixed(2).replace(".", ",")} EUR`;
}

function row(left: string, right: string) {
  const safeLeft = ascii(left);
  const safeRight = ascii(right);
  const available = Math.max(1, LINE_WIDTH - safeRight.length - 1);
  return `${safeLeft.slice(0, available).padEnd(available)} ${safeRight}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function periodLabel(period: RestaurantService["period"]) {
  if (period === "pranzo") return "PRANZO";
  if (period === "cena") return "CENA";
  return "RECUPERO";
}

function compareDineInRows(left: ServiceCloseSummaryRow, right: ServiceCloseSummaryRow) {
  const leftNumber = Number(left.label.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  const rightNumber = Number(right.label.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  return leftNumber - rightNumber || left.label.localeCompare(right.label, "it");
}

function roundMoney(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("Totale servizio non valido");
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}
