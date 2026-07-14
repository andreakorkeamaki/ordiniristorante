"use client";

import { useEffect } from "react";
import type { EscPosPreviewTicket } from "@/lib/esc-pos-preview";

export function BrowserTestPrint({
  autoPrint,
  tickets,
}: {
  autoPrint: boolean;
  tickets: EscPosPreviewTicket[];
}) {
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
          <p>Simulazione 80 mm generata dall’uscita ESC/POS di PrintNode.</p>
        </div>
        <button className="button button-primary" onClick={() => window.print()}>
          Stampa dal browser
        </button>
      </div>
      <div className="ticket-preview print-area">
        {tickets.map((ticket, ticketIndex) => (
          <article className="ticket ticket-esc-pos" key={ticketIndex}>
            {ticket.lines.map((line, lineIndex) => (
              <p
                className={`ticket-esc-line ticket-align-${line.alignment} ticket-height-${line.heightScale} ticket-width-${line.widthScale}`}
                key={lineIndex}
              >
                {line.text || "\u00a0"}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
