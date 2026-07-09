"use client";

import { useEffect } from "react";
import { PrintTicket } from "@/components/print-ticket";
import { aggregatePreparationOrderItems } from "@/lib/order-items";
import { buildSamplePrintOrder } from "@/lib/print-test-order";
import { groupOrderItemsByPrintDepartment } from "@/lib/print-ticket-format";
import type { OrderTicketPrintMode } from "@/types/domain";

export function BrowserTestPrint({
  autoPrint,
  mode,
}: {
  autoPrint: boolean;
  mode: OrderTicketPrintMode;
}) {
  const order = buildSamplePrintOrder();
  const departments =
    mode === "department_split"
      ? groupOrderItemsByPrintDepartment(order.items ?? [])
      : [
          {
            area: "cassa" as const,
            label: "COMANDA COMPLETA",
            items: aggregatePreparationOrderItems(order.items ?? []),
          },
          {
            area: "cassa" as const,
            label: "COMANDA COMPLETA",
            items: aggregatePreparationOrderItems(order.items ?? []),
          },
          {
            area: "cassa" as const,
            label: "COMANDA COMPLETA",
            items: aggregatePreparationOrderItems(order.items ?? []),
          },
        ];

  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  return (
    <section className="workspace browser-print-workspace">
      <div className="workspace-heading print-controls">
        <div>
          <p className="eyebrow">Prova browser</p>
          <h1>Comanda campione</h1>
          <p>Anteprima 80 mm per la finestra di stampa del browser.</p>
        </div>
        <button className="button button-primary" onClick={() => window.print()}>
          Stampa dal browser
        </button>
      </div>
      <div className="ticket-preview print-area">
        {departments.map((department, index) => (
          <PrintTicket
            department={department}
            key={`${department.area}-${index}`}
            label="PROVA STAMPA"
            order={order}
          />
        ))}
      </div>
    </section>
  );
}
