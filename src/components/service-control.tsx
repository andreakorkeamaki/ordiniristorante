"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantService, ServicePeriod } from "@/types/domain";

interface CloseReportNotice {
  serviceId: string;
  businessDate: string;
  period: ServicePeriod;
  total: number;
  printStatus: "pending" | "submitted" | "failed" | "uncertain";
  lastPrintError: string | null;
}

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
  const [messageTone, setMessageTone] = useState<"success" | "error">("error");
  const [blockers, setBlockers] = useState<{
    orders: Record<string, number>;
    jobs: Record<string, number>;
  } | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [forceAccepted, setForceAccepted] = useState(false);
  const [closeReport, setCloseReport] = useState<CloseReportNotice | null>(null);

  useEffect(() => {
    if (service) return;
    let active = true;
    void fetch("/api/close-service", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { report: CloseReportNotice | null };
      })
      .then((payload) => {
        if (active) setCloseReport(payload?.report ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [service]);

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
          {message && (
            <small
              className={messageTone === "success" ? "service-success" : "service-error"}
            >
              {message}
            </small>
          )}
          {serviceError && <small className="service-error">{serviceError}</small>}
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

      {!service && closeReport && closeReport.printStatus !== "submitted" && (
        <section className="service-summary-print-alert" role="status">
          <div>
            <strong>Riepilogo di fine servizio da verificare</strong>
            <p>
              {closeReport.period === "cena" ? "Cena" : "Pranzo"} del{" "}
              {formatBusinessDate(closeReport.businessDate)} · totale{" "}
              {formatMoney(closeReport.total)}.{" "}
              {closeReport.lastPrintError ?? "Stampa non completata."}
            </p>
          </div>
          <button
            className="button button-secondary"
            disabled={!canWrite || busy}
            onClick={() => void reprintSummary()}
          >
            {busy ? "Invio…" : "Ristampa riepilogo"}
          </button>
        </section>
      )}

      {service && confirmClose && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="service-close-modal">
            <p className="eyebrow">Fine servizio</p>
            <h2>Chiudere {formatServiceLabel(service)}?</h2>
            <p>
              La chiusura sicura blocca solo bozze non inviate o stampe da
              risolvere. Le comande già stampate verranno chiuse
              automaticamente.
            </p>
            <p>
              Al termine verrà salvato il riepilogo per tavolo e asporti e ne
              verrà stampata una sola copia.
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
            {blockers && hasForceableBlockers(blockers) && (
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
                  Confermo la chiusura anche con bozze o stampe non risolte e
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
                {busy ? "Chiusura…" : "Chiudi e stampa 1 copia"}
              </button>
              {blockers &&
                hasForceableBlockers(blockers) && (
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
      setMessageTone("error");
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
      setMessageTone("error");
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
    try {
      const response = await fetch("/api/close-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          serviceId: service.id,
          force,
          reason: force ? forceReason.trim() : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        closed?: boolean;
        error?: string;
        report?: CloseReportNotice;
        print?: { status: CloseReportNotice["printStatus"]; message: string };
      };
      if (payload.report) setCloseReport(payload.report);
      if (payload.closed) {
        setMessageTone(
          payload.print?.status === "submitted" && !payload.error
            ? "success"
            : "error",
        );
        setMessage(payload.print?.message ?? payload.error ?? "Servizio chiuso");
        setConfirmClose(false);
        await onChanged();
      } else if (!response.ok) {
        if (response.status >= 500) markUnreliable();
        setMessageTone("error");
        setMessage(payload.error ?? "Chiusura servizio non riuscita");
        await loadBlockers();
      }
    } catch (error) {
      markUnreliable();
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Server non raggiungibile",
      );
      await loadBlockers();
    } finally {
      setBusy(false);
    }
  }

  async function reprintSummary() {
    if (!closeReport || !canWrite || busy) return;
    if (
      ["pending", "uncertain"].includes(closeReport.printStatus) &&
      !window.confirm(
        "Controlla prima che il riepilogo non sia già uscito. Vuoi inviare una nuova copia?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/close-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprint",
          serviceId: closeReport.serviceId,
          actionKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: CloseReportNotice;
        print?: { status: CloseReportNotice["printStatus"]; message: string };
      };
      if (payload.report) setCloseReport(payload.report);
      setMessageTone(
        response.ok && payload.print?.status === "submitted" ? "success" : "error",
      );
      setMessage(payload.print?.message ?? payload.error ?? "Ristampa non riuscita");
      if (!response.ok && response.status >= 500) markUnreliable();
    } catch (error) {
      markUnreliable();
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Server non raggiungibile",
      );
    } finally {
      setBusy(false);
    }
  }
}

function countValues(counts: Record<string, number>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function countUnsafeJobs(counts: Record<string, number>) {
  return (counts.printing ?? 0) + (counts.uncertain ?? 0);
}

function hasForceableBlockers(blockers: {
  orders: Record<string, number>;
  jobs: Record<string, number>;
}) {
  return (
    countValues(blockers.orders) + countValues(blockers.jobs) > 0 &&
    countUnsafeJobs(blockers.jobs) === 0
  );
}

function formatCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length
    ? entries
        .map(([status, count]) => `${countLabel(status)} ${count}`)
        .join(", ")
    : "nessuno";
}

function countLabel(status: string) {
  return {
    draft: "bozze",
    unprinted: "senza stampa",
    pending: "in attesa",
    printing: "in stampa",
    failed: "non riusciti",
    uncertain: "da verificare",
  }[status] ?? status;
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
