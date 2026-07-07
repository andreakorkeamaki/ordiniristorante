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
  const {
    canWrite: connectionCanWrite,
    blockReason,
    markUnreliable,
  } = useConnection();
  const canWrite = connectionCanWrite && !serviceError;
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [message, setMessage] = useState("");
  const [blockers, setBlockers] = useState<{
    orders: Record<string, number>;
    jobs: Record<string, number>;
  } | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [forceAccepted, setForceAccepted] = useState(false);

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
              onClick={() => {
                setConfirmClose(true);
                setBlockers(null);
                setForceReason("");
                setForceAccepted(false);
                void loadBlockers();
              }}
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
              La chiusura sicura verifica prima ordini e job di stampa. Nessun
              ordine aperto verrà chiuso automaticamente.
            </p>
            {blockers && (
              <div className="service-blockers" role="status">
                <strong>Blocchi attuali</strong>
                <p>
                  Ordini: {formatCounts(blockers.orders)} · Job:{" "}
                  {formatCounts(blockers.jobs)}
                </p>
              </div>
            )}
            {blockers && countValues(blockers.orders) > 0 && (
              <>
                <label className="retry-reason">
                  Motivazione della chiusura forzata
                  <textarea
                    value={forceReason}
                    maxLength={500}
                    onChange={(event) => setForceReason(event.target.value)}
                  />
                </label>
                <label className="risk-confirmation">
                  <input
                    type="checkbox"
                    checked={forceAccepted}
                    onChange={(event) => setForceAccepted(event.target.checked)}
                  />
                  Confermo che gli ordini aperti verranno chiusi o annullati e
                  che la motivazione resterà auditata.
                </label>
              </>
            )}
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
                onClick={() => void close(false)}
              >
                {busy ? "Verifica…" : "Esegui chiusura sicura"}
              </button>
              {blockers &&
                countValues(blockers.orders) > 0 &&
                countUnsafeJobs(blockers.jobs) === 0 && (
                  <button
                    className="button button-danger"
                    disabled={
                      !canWrite ||
                      busy ||
                      !forceAccepted ||
                      forceReason.trim().length < 10
                    }
                    onClick={() => void close(true)}
                  >
                    Forza chiusura con motivazione
                  </button>
                )}
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

  async function loadBlockers() {
    if (!service) return;
    const { data, error } = await createClient().rpc(
      "get_service_close_blockers",
      { p_service_id: service.id },
    );
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      return;
    }
    setBlockers(
      (data as {
        orders: Record<string, number>;
        jobs: Record<string, number>;
      }) ?? { orders: {}, jobs: {} },
    );
  }

  async function close(force: boolean) {
    if (!service || !canWrite || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("close_service", {
      p_service_id: service.id,
      p_force: force,
      p_reason: force ? forceReason.trim() : null,
    });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      await loadBlockers();
    } else {
      setConfirmClose(false);
      await onChanged();
    }
    setBusy(false);
  }
}

function countValues(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function countUnsafeJobs(counts: Record<string, number>) {
  return (counts.printing ?? 0) + (counts.uncertain ?? 0);
}

function formatCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length
    ? entries.map(([status, count]) => `${status} ${count}`).join(", ")
    : "nessuno";
}
