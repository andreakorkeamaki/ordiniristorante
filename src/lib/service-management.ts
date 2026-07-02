import type { RestaurantService, ServicePeriod } from "@/types/domain";

export const SERVICE_PERIOD_LABELS: Record<ServicePeriod, string> = {
  pranzo: "Pranzo",
  cena: "Cena",
  recupero: "Servizio precedente",
};

export function formatServiceLabel(service: RestaurantService) {
  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  }).format(new Date(`${service.business_date}T12:00:00+02:00`));

  return `${SERVICE_PERIOD_LABELS[service.period]} · ${date}`;
}

export function isPreviousService(
  service: RestaurantService,
  today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(new Date()),
) {
  return service.period === "recupero" || service.business_date !== today;
}
