export const RAW_PRINT_COPIES = 3;

export function buildPrintNodePayload(input: {
  printerId: number;
  title: string;
  content: Buffer;
  copies?: number;
  source?: string;
}) {
  const copies = input.copies ?? RAW_PRINT_COPIES;
  if (!Number.isSafeInteger(copies) || copies < 1 || copies > 10) {
    throw new Error("Numero copie non valido");
  }

  return {
    printerId: input.printerId,
    title: input.title,
    contentType: "raw_base64" as const,
    content: input.content.toString("base64"),
    source: input.source ?? "La Sagretta cassa",
    qty: copies,
    expireAfter: 600,
  };
}
