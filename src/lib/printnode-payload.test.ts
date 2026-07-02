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

  it("permette di chiedere una sola copia per lo scontrino", () => {
    const payload = buildPrintNodePayload({
      printerId: 123,
      title: "SCONTRINO #42",
      content: Buffer.from("TOTALE 23,80 EUR\n", "ascii"),
      copies: 1,
    });

    expect(payload.qty).toBe(1);
  });

  it("salva nel source l'identità locale usata per recuperare una collisione", () => {
    const payload = buildPrintNodePayload({
      printerId: 123,
      title: "NUOVA COMANDA #42",
      content: Buffer.from("ticket"),
      source: "Appordini print_job:local-job",
    });

    expect(payload.source).toBe("Appordini print_job:local-job");
  });
});
