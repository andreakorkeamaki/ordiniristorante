import type { OperationalEvent } from "@/lib/operational-events";

export function reportOperationalError({
  event,
  error,
  orderId,
  printJobId,
}: {
  event: OperationalEvent;
  error: unknown;
  orderId?: string;
  printJobId?: string;
}) {
  const message = cleanText(readErrorField(error, "message") || "Errore sconosciuto", 300);
  const rawCode = readErrorField(error, "code");
  const code = rawCode
    ? cleanText(rawCode, 32).replace(/[^A-Za-z0-9_.-]/g, "_")
    : undefined;

  void fetch("/api/operational-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      message,
      ...(code ? { code } : {}),
      ...(orderId ? { orderId } : {}),
      ...(printJobId ? { printJobId } : {}),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

function readErrorField(error: unknown, field: "code" | "message") {
  if (error instanceof Error && field === "message") return error.message;
  if (typeof error !== "object" || error === null || !(field in error)) return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);
}
