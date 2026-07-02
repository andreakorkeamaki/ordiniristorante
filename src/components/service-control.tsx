"use client";

import { useState } from "react";
import { useConnection } from "@/components/connection-provider";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantService, ServicePeriod } from "@/types/domain";

export function ServiceControl({
  service,
  serviceLoading,
  serviceError,
  activeOrderCount,
  onChanged,
}: {
  service: RestaurantService | null;
  serviceLoading: boolean;
  serviceError: string;
  activeOrderCount: number;
  onChanged: () => Promise<void>;
}) {
  const { canWrite, blockReason, markUnreliable } = useConnection();
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [message, setMessage] = useState("");

  if (serviceLoading) {
    return (
      <section className="service-control" aria-live="polite">
        <strong>Verifica servizio in corso…</strong>
      </section>
    );
  }

  return (
    <>
      <section
        className={`service-control ${service ? "is-open" : "is-closed"} ${
          service && isPreviousService(service) ? "is-previous" : ""
        }`}
        aria-live="polite"
      >
        <div>
          <p className="eyebrow">Servizio operativo</p>
          <h2>
            {service
              ? formatServiceLabel(service)
              : "Nessun servizio aperto"}
          </h2>
          <p>
            {service
              ? `${activeOrderCount} tavoli attivi · aperto alle ${new Intl.DateTimeFormat(
                  "it-IT",
                  { hour: "2-digit", minute: "2-digit" },
                ).format(new Date(service.opened_at))}`
              : "Apri il pranzo o la cena prima di creare nuove comande."}
          </p>
          {service && isPreviousService(service) && (
            <strong className="service-warning">
              È un servizio precedente: chiudilo prima di iniziare quello di oggi.
            </strong>
          )}
          {(message || serviceError) && (
            <small className="service-error">{message || serviceError}</small>
          )}
        </div>

        <div className="service-actions">
          {service ? (
            <button
              className="button button-danger"
              disabled={!canWrite || busy}
              title={!canWrite ? blockReason ?? undefined : undefined}
              onClick={() => setConfirmClose(true)}
            >
              Chiudi servizio
            </button>
          ) : (
            <>
              <button
                className="button button-primary"
                disabled={!canWrite || busy}
                onClick={() => void start("pranzo")}
              >
                Inizia pranzo
              </button>
              <button
                className="button button-secondary"
                disabled={!canWrite || busy}
                onClick={() => void start("cena")}
              >
                Inizia cena
              </button>
            </>
          )}
        </div>
      </section>

      {service && confirmClose && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="service-close-modal">
            <p className="eyebrow">Fine servizio</p>
            <h2>Chiudere {formatServiceLabel(service)}?</h2>
            <p>
              Verranno liberati <strong>{activeOrderCount} tavoli</strong>. Le
              comande inviate resteranno nello storico; le bozze non inviate saranno
              annullate.
            </p>
            <p>Questa operazione non cancella ordini o incassi.</p>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setConfirmClose(false)}
              >
                Annulla
              </button>
              <button
                className="button button-danger"
                disabled={!canWrite || busy}
                onClick={() => void close()}
              >
                {busy ? "Chiusura…" : "Chiudi servizio e libera i tavoli"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  async function start(period: Exclude<ServicePeriod, "recupero">) {
    if (!canWrite || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("start_service", {
      p_period: period,
    });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
    } else {
      await onChanged();
    }
    setBusy(false);
  }

  async function close() {
    if (!service || !canWrite || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("close_service", {
      p_service_id: service.id,
      p_force: true,
    });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
    } else {
      setConfirmClose(false);
      await onChanged();
    }
    setBusy(false);
  }
}
