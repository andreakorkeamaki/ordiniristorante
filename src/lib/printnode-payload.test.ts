import { describe, expect, it } from "vitest";
import {
  buildPrintNodePayload,
  RAW_PRINT_COPIES,
} from "@/lib/printnode-payload";

describe("buildPrintNodePayload", () => {
  it("invia un solo ticket RAW chiedendo a PrintNode tre copie identiche", () => {
    const ticket = Buffer.from("NUOVA COMANDA\nTAVOLO 7\n", "ascii");
    const payload = buildPrintNodePayload({
      printerId: 123,
      title: "NUOVA COMANDA #42",
      content: ticket,
    });

    expect(RAW_PRINT_COPIES).toBe(3);
    expect(payload.qty).toBe(3);
    expect(payload.contentType).toBe("raw_base64");
    expect(Buffer.from(payload.content, "base64")).toEqual(ticket);
  });
});
