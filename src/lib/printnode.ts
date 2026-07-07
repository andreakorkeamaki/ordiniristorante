import "server-only";

import { buildPrintNodePayload } from "@/lib/printnode-payload";

const PRINTNODE_BASE_URL = "https://api.printnode.com";

export interface PrintNodePrinter {
  id: number;
  name: string;
  description: string | null;
  state: string;
  computer: {
    id: number;
    name: string;
    hostname: string | null;
    state: string;
  };
}

export interface PrintNodeJobState {
  printJobId: number;
  state: string;
  message: string | null;
  createTimestamp: string;
}

interface PrintNodeJob {
  id: number;
  title?: string;
  source?: string;
  createTimestamp?: string;
}

export interface PrinterAvailability {
  configured: boolean;
  available: boolean;
  printer: PrintNodePrinter | null;
  message: string;
  reason:
    | "available"
    | "not_configured"
    | "api_unreachable"
    | "timeout"
    | "computer_disconnected"
    | "printer_offline"
    | "printer_not_found";
}

export class PrintNodeSubmissionError extends Error {
  readonly outcomeUncertain: boolean;

  constructor(message: string, outcomeUncertain = false) {
    super(message);
    this.name = "PrintNodeSubmissionError";
    this.outcomeUncertain = outcomeUncertain;
  }
}

export class PrintNodeIdempotencyError extends PrintNodeSubmissionError {
  constructor(message: string) {
    super(message, true);
    this.name = "PrintNodeIdempotencyError";
  }
}

function getConfig() {
  const apiKey = process.env.PRINTNODE_API_KEY;
  const printerIdValue = process.env.PRINTNODE_PRINTER_ID;
  const printerId = Number(printerIdValue);

  if (!apiKey || !printerIdValue || !Number.isSafeInteger(printerId) || printerId <= 0) {
    return null;
  }

  return { apiKey, printerId };
}

async function request(path: string, init?: RequestInit) {
  const config = getConfig();
  if (!config) throw new Error("PrintNode non configurato");

  return fetch(`${PRINTNODE_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:`).toString("base64")}`,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

async function errorMessage(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message ?? `PrintNode HTTP ${response.status}`;
  } catch {
    return body || `PrintNode HTTP ${response.status}`;
  }
}

export async function getPrinterAvailability(): Promise<PrinterAvailability> {
  const config = getConfig();
  if (!config) {
    return {
      configured: false,
      available: false,
      printer: null,
      message: "PrintNode non configurato",
      reason: "not_configured",
    };
  }

  try {
    const response = await request(`/printers/${config.printerId}`);
    if (!response.ok) {
      const technicalError = await errorMessage(response);
      console.warn(JSON.stringify({
        scope: "printnode",
        event: "availability_http_error",
        status: response.status,
        technical_error: technicalError,
        timestamp: new Date().toISOString(),
      }));
      return {
        configured: true,
        available: false,
        printer: null,
        message: "Servizio PrintNode non raggiungibile",
        reason: "api_unreachable",
      };
    }

    const printers = (await response.json()) as PrintNodePrinter[];
    const printer = printers[0] ?? null;
    const available =
      printer?.state === "online" && printer.computer.state === "connected";

    return {
      configured: true,
      available,
      printer,
      message: available
        ? `${printer.name} online su ${printer.computer.name}`
        : printer
          ? `${printer.name}: stampante ${printer.state}, Dell ${printer.computer.state}`
          : "Stampante PrintNode non trovata",
      reason: available
        ? "available"
        : !printer
          ? "printer_not_found"
          : printer.computer.state !== "connected"
            ? "computer_disconnected"
            : "printer_offline",
    };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    console.warn(JSON.stringify({
      scope: "printnode",
      event: "availability_request_failed",
      outcome: timeout ? "timeout" : "unreachable",
      technical_error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }));
    return {
      configured: true,
      available: false,
      printer: null,
      message: timeout
        ? "PrintNode non ha risposto in tempo"
        : "PrintNode non raggiungibile",
      reason: timeout ? "timeout" : "api_unreachable",
    };
  }
}

export async function createPrintNodeJob(input: {
  title: string;
  content: Buffer;
  idempotencyKey: string;
  copies?: number;
  source: string;
  createdAfter?: string;
}) {
  const config = getConfig();
  if (!config) throw new Error("PrintNode non configurato");

  let response: Response;
  try {
    response = await request("/printjobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(buildPrintNodePayload({
        printerId: config.printerId,
        title: input.title,
        content: input.content,
        copies: input.copies,
        source: input.source,
      })),
    });
  } catch (error) {
    const recovered = await findPrintNodeJobBySource(
      input.source,
      input.createdAfter,
    ).catch(() => null);
    if (recovered) return { id: recovered.id, recovered: true };
    throw new PrintNodeSubmissionError(
      error instanceof Error ? error.message : "PrintNode non raggiungibile",
      true,
    );
  }

  if (response.status === 409) {
    const recovered = await findPrintNodeJobBySource(
      input.source,
      input.createdAfter,
    ).catch(() => null);
    if (recovered) return { id: recovered.id, recovered: true };
    throw new PrintNodeIdempotencyError(await errorMessage(response));
  }
  if (!response.ok) {
    throw new PrintNodeSubmissionError(await errorMessage(response));
  }

  const printNodeJobId = Number(await response.json());
  if (!Number.isSafeInteger(printNodeJobId) || printNodeJobId <= 0) {
    throw new PrintNodeSubmissionError(
      "PrintNode ha restituito un identificativo non valido",
      true,
    );
  }

  return { id: printNodeJobId, recovered: false };
}

export async function findPrintNodeJobBySource(
  source: string,
  createdAfter?: string,
) {
  const lowerBound = createdAfter
    ? new Date(createdAfter).getTime() - 60_000
    : Number.NEGATIVE_INFINITY;
  let after: number | null = null;

  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: "100", dir: "desc" });
    if (after) query.set("after", String(after));
    const response = await request(`/printjobs?${query.toString()}`);
    if (!response.ok) throw new Error(await errorMessage(response));

    const jobs = (await response.json()) as PrintNodeJob[];
    const match = jobs.find(
      (job) =>
        job.source === source &&
        Number.isSafeInteger(Number(job.id)) &&
        Number(job.id) > 0 &&
        (!job.createTimestamp ||
          new Date(job.createTimestamp).getTime() >= lowerBound),
    );
    if (match) return match;
    if (jobs.length < 100) return null;

    const oldest = jobs.at(-1);
    if (
      oldest?.createTimestamp &&
      new Date(oldest.createTimestamp).getTime() < lowerBound
    ) {
      return null;
    }
    after = Number(oldest?.id);
    if (!Number.isSafeInteger(after) || after <= 0) return null;
  }
  return null;
}

export async function getPrintNodeJobStates(ids: number[]) {
  if (!ids.length) return [];
  const states: PrintNodeJobState[] = [];
  for (const chunk of chunkIds(ids, 50)) {
    const response = await request(`/printjobs/${chunk.join(",")}/states`);
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = (await response.json()) as PrintNodeJobState[][];
    states.push(...payload.flat());
  }
  return states;
}

export async function cancelPrintNodeJobs(ids: number[]) {
  if (!ids.length) return [];
  const cancelled: number[] = [];
  for (const chunk of chunkIds(ids, 50)) {
    const response = await request(`/printjobs/${chunk.join(",")}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    cancelled.push(...((await response.json()) as number[]));
  }
  return cancelled;
}

function chunkIds(ids: number[], size: number) {
  const uniqueIds = [...new Set(ids)];
  const chunks: number[][] = [];
  for (let index = 0; index < uniqueIds.length; index += size) {
    chunks.push(uniqueIds.slice(index, index + size));
  }
  return chunks;
}
