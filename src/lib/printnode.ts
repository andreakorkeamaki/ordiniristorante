import "server-only";

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

export interface PrinterAvailability {
  configured: boolean;
  available: boolean;
  printer: PrintNodePrinter | null;
  message: string;
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
    };
  }

  try {
    const response = await request(`/printers/${config.printerId}`);
    if (!response.ok) {
      return {
        configured: true,
        available: false,
        printer: null,
        message: await errorMessage(response),
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
    };
  } catch (error) {
    return {
      configured: true,
      available: false,
      printer: null,
      message: error instanceof Error ? error.message : "PrintNode non raggiungibile",
    };
  }
}

export async function createPrintNodeJob(input: {
  title: string;
  content: Buffer;
  idempotencyKey: string;
}) {
  const config = getConfig();
  if (!config) throw new Error("PrintNode non configurato");

  const response = await request("/printjobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      printerId: config.printerId,
      title: input.title,
      contentType: "raw_base64",
      content: input.content.toString("base64"),
      source: "La Sagretta cassa",
      qty: 3,
      expireAfter: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const printNodeJobId = Number(await response.json());
  if (!Number.isSafeInteger(printNodeJobId) || printNodeJobId <= 0) {
    throw new Error("PrintNode ha restituito un identificativo non valido");
  }

  return printNodeJobId;
}

export async function getPrintNodeJobStates(ids: number[]) {
  if (!ids.length) return [];
  const response = await request(`/printjobs/${ids.join(",")}/states`);
  if (!response.ok) throw new Error(await errorMessage(response));

  const payload = (await response.json()) as PrintNodeJobState[][];
  return payload.flat();
}

export async function cancelPrintNodeJobs(ids: number[]) {
  if (!ids.length) return [];
  const response = await request(`/printjobs/${ids.join(",")}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as number[];
}
