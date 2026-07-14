import { describe, expect, it } from "vitest";
import { decodeEscPosPreview } from "@/lib/esc-pos-preview";
import { buildSamplePrintOrder } from "@/lib/print-test-order";
import {
  buildRaw80mmDepartmentTicket,
  buildRaw80mmTicket,
} from "@/lib/print-ticket-raw";

describe("decodeEscPosPreview", () => {
  it("riproduce le tre sezioni e gli stili generati per PrintNode", () => {
    const raw = buildRaw80mmDepartmentTicket(buildSamplePrintOrder(), "new_order");
    const tickets = decodeEscPosPreview(raw);

    expect(tickets).toHaveLength(3);
    expect(tickets[0].lines).toContainEqual({
      alignment: "center",
      heightScale: 2,
      text: "LA SAGRETTA",
      widthScale: 2,
    });
    expect(tickets[0].lines).toContainEqual({
      alignment: "left",
      heightScale: 2,
      text: "2R Diavola",
      widthScale: 2,
    });
    expect(tickets[0].lines).toContainEqual({
      alignment: "left",
      heightScale: 3,
      text: "+ Mozzarella",
      widthScale: 3,
    });
    expect(tickets[0].lines).toContainEqual({
      alignment: "left",
      heightScale: 2,
      text: "Nota: ben cotta",
      widthScale: 2,
    });
    expect(tickets[1].lines.some((line) => line.text === "2R Diavola")).toBe(false);
    expect(tickets[2].lines.some((line) => line.text === "4 Acqua")).toBe(true);
  });

  it("ripete nel browser le copie fisiche richieste a PrintNode", () => {
    const raw = buildRaw80mmTicket(buildSamplePrintOrder(), "new_order");
    const tickets = decodeEscPosPreview(raw, 3);

    expect(tickets).toHaveLength(3);
    expect(tickets[0]).toEqual(tickets[1]);
    expect(tickets[1]).toEqual(tickets[2]);
  });
});
