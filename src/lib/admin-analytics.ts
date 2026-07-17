import type { ServicePeriod } from "@/types/domain";

export type AnalyticsPeriod = ServicePeriod | null;

export interface AnalyticsRange {
  from: string;
  to: string;
  period: AnalyticsPeriod;
}

export interface AnalyticsMetrics {
  revenue: number;
  order_count: number;
  cover_count: number;
  cancelled_count: number;
  service_count: number;
  average_order: number;
  average_cover: number;
  known_cost: number;
  cost_coverage: number;
  gross_profit: number | null;
  dine_in_revenue: number;
  takeaway_revenue: number;
}

export interface AnalyticsDailyEntry {
  date: string;
  revenue: number;
  order_count: number;
}

export interface AnalyticsProductEntry {
  name: string;
  quantity: number;
  revenue: number;
}

export interface AnalyticsServiceEntry {
  id: string;
  business_date: string;
  period: ServicePeriod;
  opened_at: string;
  closed_at: string | null;
  forced_close: boolean;
  order_count: number;
  cancelled_count: number;
  cover_count: number;
  revenue: number;
  average_order: number;
  known_cost: number;
  cost_coverage: number;
  gross_profit: number | null;
  duration_minutes: number;
}

export interface AdminAnalytics {
  metrics: AnalyticsMetrics;
  daily: AnalyticsDailyEntry[];
  top_pizzas: AnalyticsProductEntry[];
  top_products: AnalyticsProductEntry[];
  services: AnalyticsServiceEntry[];
}

export interface CostCatalogEntry {
  id: string;
  name: string;
  category: string;
  price: number;
  unit_cost: number | null;
  active: boolean;
}

export interface CostCatalog {
  items: CostCatalogEntry[];
  extras: CostCatalogEntry[];
}

const PERIODS = new Set<ServicePeriod>(["pranzo", "cena", "recupero"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveAnalyticsRange(
  params: { from?: string; to?: string; period?: string },
  today = businessDateToday(),
): AnalyticsRange {
  const defaultFrom = shiftIsoDate(today, -29);
  const from = isIsoDate(params.from) ? params.from : defaultFrom;
  const to = isIsoDate(params.to) ? params.to : today;

  return {
    from: from <= to ? from : defaultFrom,
    to: from <= to ? to : today,
    period: PERIODS.has(params.period as ServicePeriod)
      ? (params.period as ServicePeriod)
      : null,
  };
}

export function businessDateToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeAdminAnalytics(value: unknown): AdminAnalytics {
  const root = asRecord(value);
  const metrics = asRecord(root.metrics);

  return {
    metrics: {
      revenue: numberValue(metrics.revenue),
      order_count: numberValue(metrics.order_count),
      cover_count: numberValue(metrics.cover_count),
      cancelled_count: numberValue(metrics.cancelled_count),
      service_count: numberValue(metrics.service_count),
      average_order: numberValue(metrics.average_order),
      average_cover: numberValue(metrics.average_cover),
      known_cost: numberValue(metrics.known_cost),
      cost_coverage: boundedPercentage(metrics.cost_coverage),
      gross_profit: nullableNumber(metrics.gross_profit),
      dine_in_revenue: numberValue(metrics.dine_in_revenue),
      takeaway_revenue: numberValue(metrics.takeaway_revenue),
    },
    daily: arrayValue(root.daily).map((entry) => {
      const row = asRecord(entry);
      return {
        date: stringValue(row.date),
        revenue: numberValue(row.revenue),
        order_count: numberValue(row.order_count),
      };
    }),
    top_pizzas: normalizeProducts(root.top_pizzas),
    top_products: normalizeProducts(root.top_products),
    services: arrayValue(root.services).map((entry) => {
      const row = asRecord(entry);
      const period = stringValue(row.period);
      return {
        id: stringValue(row.id),
        business_date: stringValue(row.business_date),
        period: PERIODS.has(period as ServicePeriod)
          ? (period as ServicePeriod)
          : "recupero",
        opened_at: stringValue(row.opened_at),
        closed_at: nullableString(row.closed_at),
        forced_close: row.forced_close === true,
        order_count: numberValue(row.order_count),
        cancelled_count: numberValue(row.cancelled_count),
        cover_count: numberValue(row.cover_count),
        revenue: numberValue(row.revenue),
        average_order: numberValue(row.average_order),
        known_cost: numberValue(row.known_cost),
        cost_coverage: boundedPercentage(row.cost_coverage),
        gross_profit: nullableNumber(row.gross_profit),
        duration_minutes: numberValue(row.duration_minutes),
      };
    }),
  };
}

export function normalizeCostCatalog(value: unknown): CostCatalog {
  const root = asRecord(value);
  return {
    items: normalizeCostEntries(root.items),
    extras: normalizeCostEntries(root.extras),
  };
}

function normalizeProducts(value: unknown): AnalyticsProductEntry[] {
  return arrayValue(value).map((entry) => {
    const row = asRecord(entry);
    return {
      name: stringValue(row.name),
      quantity: numberValue(row.quantity),
      revenue: numberValue(row.revenue),
    };
  });
}

function normalizeCostEntries(value: unknown): CostCatalogEntry[] {
  return arrayValue(value).map((entry) => {
    const row = asRecord(entry);
    return {
      id: stringValue(row.id),
      name: stringValue(row.name),
      category: stringValue(row.category),
      price: numberValue(row.price),
      unit_cost: nullableNumber(row.unit_cost),
      active: row.active === true,
    };
  });
}

function isIsoDate(value: string | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boundedPercentage(value: unknown) {
  return Math.min(100, Math.max(0, numberValue(value)));
}
