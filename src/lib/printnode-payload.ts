export const RAW_PRINT_COPIES = 3;

export function buildPrintNodePayload(input: {
  printerId: number;
  title: string;
  content: Buffer;
}) {
  return {
    printerId: input.printerId,
    title: input.title,
    contentType: "raw_base64" as const,
    content: input.content.toString("base64"),
    source: "La Sagretta cassa",
    qty: RAW_PRINT_COPIES,
    expireAfter: 600,
  };
}
