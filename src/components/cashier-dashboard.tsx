"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { PrintTicket } from "@/components/print-ticket";
import { ServiceControl } from "@/components/service-control";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";
import { getOrderLocationLabel, getOrderShortLabel } from "@/lib/order-display";
import {
  canSafelyCancelPrintJob,
  getPrintJobDisplayState,
  getPrintJobStatusLabel,
  getStaffPrintMessage,
} from "@/lib/print-job-state";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  Order,
  OrderItem,
  PrintJob,
  PrintJobType,
  Profile,
  RestaurantSettings,
  RestaurantTable,
} from "@/types/domain";

const ACTIVE = ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"];
const JOB_LABELS: Record<PrintJobType, string> = {
  new_order: "NUOVA COMANDA",
  order_update: "AGGIORNAMENTO COMANDA",
  cancellation: "ANNULLAMENTO",
  reprint: "RISTAMPA",
};

interface PrinterStatus {
  configured: boolean;
  available: boolean;
  message: string;
  printer: {
    name: string;
    state: string;
    computer: { name: string; state: string };
  } | null;
}

interface SelectedTicket {
  order: Order;
  type: PrintJobType;
  jobId?: string;
}

type PrintConfirmation =
  | { kind: "manual"; order: Order; jobs: PrintJob[] }
  | {
      kind: "retry";
      order: Order;
      job: PrintJob;
      actionKey: string;
    }
  | {
      kind: "reprint";
      order: Order;
      job: PrintJob | null;
      actionKey: string;
    };

export function CashierDashboard() {
  const { canWrite, blockReason, markUnreliable } = useConnection();
  const {
    service,
    loading: serviceLoading,
    error: serviceError,
    reload: reloadService,
  } = useCurrentService();
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [filter, setFilter] = useState("");
  const [waiterFilter, setWaiterFilter] = useState("");
  const [selected, setSelected] = useState<SelectedTicket | null>(null);
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [message, setMessage] = useState("");
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PrintConfirmation | null>(null);
  const [detailsJob, setDetailsJob] = useState<PrintJob | null>(null);
  const [retryReason, setRetryReason] = useState(
    "Ristampa forzata dopo verifica in cassa",
  );
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [activeOrdersResult, tablesResult, profilesResult, jobsResult, settingsResult] = await Promise.all([
      supabase.from("orders").select("*").in("status", ACTIVE).order("created_at"),
      supabase.from("restaurant_tables").select("*"),
      supabase.from("profiles").select("id, full_name, role, active"),
      supabase
        .from("print_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("restaurant_settings").select("*").limit(1).maybeSingle(),
    ]);
    const firstError =
      activeOrdersResult.error ??
      tablesResult.error ??
      profilesResult.error ??
      jobsResult.error ??
      settingsResult.error;
    if (firstError) {
      if (!firstError.code) markUnreliable();
      setLoading(false);
      return;
    }

    const rawJobs = (jobsResult.data ?? []) as PrintJob[];
    const activeOrders = (activeOrdersResult.data ?? []) as Order[];
    const activeIds = new Set(activeOrders.map((order) => order.id));
    const missingIds = [...new Set(rawJobs.map((job) => job.order_id).filter((id) => !activeIds.has(id)))];
    const queuedOrdersResult = missingIds.length
      ? await supabase.from("orders").select("*").in("id", missingIds)
      : { data: [], error: null };
    if (queuedOrdersResult.error) {
      if (!queuedOrdersResult.error.code) markUnreliable();
      setLoading(false);
      return;
    }
    const rawOrders = [
      ...activeOrders,
      ...((queuedOrdersResult.data ?? []) as Order[]).filter((order) => !activeIds.has(order.id)),
    ];
    const orderIds = rawOrders.map((order) => order.id);
    const linesResult = orderIds.length
      ? await supabase
          .from("order_items")
          .select("*, extras:order_item_extras(*)")
          .in("order_id", orderIds)
          .order("created_at")
      : { data: [], error: null };
    if (linesResult.error) {
      if (!linesResult.error.code) markUnreliable();
      setLoading(false);
      return;
    }
    const tables = new Map(
      ((tablesResult.data ?? []) as RestaurantTable[]).map((table) => [table.id, table]),
    );
    const profiles = new Map(
      ((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]),
    );
    const lines = (linesResult.data ?? []) as OrderItem[];

    setOrders(
      rawOrders.map((order) => ({
        ...order,
        table: order.table_id ? tables.get(order.table_id) : undefined,
        waiter: profiles.get(order.created_by),
        items: lines.filter((line) => line.order_id === order.id),
      })),
    );
    setJobs(rawJobs);
    setSettings(settingsResult.data as RestaurantSettings | null);
    setLoading(false);
  }, [markUnreliable]);

  const refreshPrinter = useCallback(async () => {
    try {
      const response = await fetch("/api/print-order", { cache: "no-store" });
      const payload = (await response.json()) as PrinterStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Stato stampante non disponibile");
      setPrinter(payload);
    } catch (error) {
      if (error instanceof TypeError) markUnreliable();
      setPrinter({
        configured: true,
        available: false,
        printer: null,
        message: error instanceof Error ? error.message : "PrintNode non raggiungibile",
      });
    }
  }, [markUnreliable]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void refreshPrinter();
    });

    const supabase = createClient();
    const channel = supabase
      .channel("cashier-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, load)
      .subscribe();
    const interval = window.setInterval(() => {
      void refreshPrinter().then(load);
    }, 15_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [load, refreshPrinter]);

  const orderById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );
  const activeOrders = orders.filter((order) => ACTIVE.includes(order.status));
  const filtered = useMemo(
    () =>
      activeOrders.filter((order) => {
        const tableMatches =
          !filter ||
          String(order.table?.table_number ?? "").includes(filter) ||
          String(order.order_number).includes(filter) ||
          String(order.takeaway_name ?? "").toLowerCase().includes(filter.toLowerCase());
        const waiterMatches = !waiterFilter || order.created_by === waiterFilter;
        return tableMatches && waiterMatches;
      }),
    [activeOrders, filter, waiterFilter],
  );
  const jobFor = useCallback(
    (orderId: string, type: PrintJobType) =>
      jobs.find((job) => job.order_id === orderId && job.job_type === type),
    [jobs],
  );
  const waiters = [
    ...new Map(
      activeOrders
        .filter((order) => order.waiter)
        .map((order) => [order.created_by, order.waiter!]),
    ).values(),
  ];
  const newOrders = filtered.filter((order) => order.status === "pending_cashier");
  const waitingPrint = filtered.filter(
    (order) =>
      order.status === "confirmed" && jobFor(order.id, "new_order")?.status !== "printed",
  );
  const preparing = filtered.filter(
    (order) =>
      order.status === "in_preparation" ||
      order.status === "bill_requested" ||
      jobFor(order.id, "new_order")?.status === "printed",
  );
  const queuedJobs = jobs.filter((job) =>
    ["pending", "printing", "failed"].includes(job.status) &&
    isCurrentServiceJob(job, orderById, service?.id),
  );
  const historicalFailures = jobs.filter(
    (job) =>
      job.status === "failed" &&
      !isCurrentServiceJob(job, orderById, service?.id),
  );

  if (loading) return <div className="loader" aria-label="Caricamento cassa" />;

  return (
    <>
      <section className="workspace-heading cashier-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Cassa</h1>
          <p>Aggiornamento automatico in tempo reale</p>
        </div>
        <div className="cashier-filters">
          <input
            placeholder="Tavolo, asporto o comanda"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <select value={waiterFilter} onChange={(event) => setWaiterFilter(event.target.value)}>
            <option value="">Tutti i camerieri</option>
            {waiters.map((waiter) => (
              <option key={waiter.id} value={waiter.id}>{waiter.full_name}</option>
            ))}
          </select>
        </div>
      </section>

      <ServiceControl
        service={service}
        serviceLoading={serviceLoading}
        serviceError={serviceError}
        activeOrderCount={activeOrders.length}
        onChanged={async () => {
          await Promise.all([reloadService(), load()]);
        }}
      />

      <section
        className={`printer-status ${printer?.available ? "is-online" : "is-offline"}`}
        aria-live="polite"
      >
        <span className="printer-status-dot" />
        <div>
          <strong>{printer?.available ? "Stampante online" : "Stampa manuale disponibile"}</strong>
          <p>{printer?.message ?? "Verifica PrintNode in corso…"}</p>
        </div>
        <button className="text-button" onClick={() => void refreshPrinter().then(load)}>
          Aggiorna
        </button>
      </section>

      {message && (
        <button className="external-update" onClick={() => setMessage("")}>
          {message} · Chiudi
        </button>
      )}
      {!canWrite && (
        <p className="connection-action-hint" role="status">
          {blockReason} Le azioni di cassa e stampa restano disabilitate.
        </p>
      )}

      <section className="print-queue">
        <div className="print-queue-heading">
          <div>
            <p className="eyebrow">Print jobs</p>
            <h2>Coda stampa</h2>
          </div>
          <span>{queuedJobs.length} job in coda</span>
        </div>
        <div className="print-job-list">
          {queuedJobs.length ? queuedJobs.map((job) => {
            const order = orderById.get(job.order_id);
            const displayState = getPrintJobDisplayState(job);
            const staffMessage = getStaffPrintMessage(job);
            const tableJobs = jobs.filter(
              (candidate) =>
                candidate.order_id === job.order_id &&
                ["printing", "failed"].includes(candidate.status),
            );
            return (
              <article
                className={`print-job-row status-${displayState}`}
                key={job.id}
              >
                <div>
                  <div className="print-job-title">
                    <strong>
                      {JOB_LABELS[job.job_type]} · #{order?.order_number ?? "—"}
                    </strong>
                    <span className={`print-status-badge status-${displayState}`}>
                      {getPrintJobStatusLabel(job)}
                    </span>
                    {job.manually_confirmed && (
                      <span className="print-status-badge is-manual">
                        Confermato manualmente
                      </span>
                    )}
                  </div>
                  <p>
                    {order ? getOrderShortLabel(order) : "Ordine —"} · {job.copies}{" "}
                    {job.copies === 1 ? "copia" : "copie"}
                    {job.printnode_job_id ? ` · PrintNode #${job.printnode_job_id}` : ""}
                    {job.last_attempt_at
                      ? ` · ultimo tentativo ${formatDateTime(job.last_attempt_at)}`
                      : ""}
                  </p>
                  {staffMessage && <small>{staffMessage}</small>}
                </div>
                <div className="print-job-actions">
                  {job.status === "pending" && order && (
                    <button
                      disabled={!canWrite || busyJobId === job.id}
                      onClick={() => void dispatchPrint(order, job.job_type)}
                    >
                      Avvia stampa
                    </button>
                  )}
                  {["printing", "failed"].includes(job.status) && order && (
                    <>
                      <button
                        disabled={!canWrite || busyJobId !== null}
                        onClick={() => openManualConfirmation(order, [job])}
                      >
                        Segna come stampata
                      </button>
                      <button
                        className="button-warning"
                        disabled={!canWrite || busyJobId !== null}
                        onClick={() => openRetryConfirmation(order, job)}
                      >
                        Riprova stampa
                      </button>
                    </>
                  )}
                  {tableJobs.length > 1 && order && (
                    <button
                      disabled={!canWrite || busyJobId !== null}
                      onClick={() => openManualConfirmation(order, tableJobs)}
                    >
                      Completa stampe tavolo
                    </button>
                  )}
                  {canSafelyCancelPrintJob(job) && (
                    <button
                      className="button-danger"
                      disabled={!canWrite || busyJobId !== null}
                      onClick={() => void cancelQueuedPrintJob(job)}
                    >
                      Annulla job
                    </button>
                  )}
                  <button onClick={() => setDetailsJob(job)}>
                    Dettagli stampa
                  </button>
                </div>
              </article>
            );
          }) : <p className="column-empty">Nessun job operativo da gestire</p>}
        </div>
      </section>

      {historicalFailures.length > 0 && (
        <details className="historical-print-jobs">
          <summary>
            Stampe fallite di servizi precedenti ({historicalFailures.length})
          </summary>
          <div className="print-job-list">
            {historicalFailures.map((job) => {
              const order = orderById.get(job.order_id);
              return (
                <button
                  className="historical-print-row"
                  key={job.id}
                  onClick={() => setDetailsJob(job)}
                >
                  <span>
                    {JOB_LABELS[job.job_type]} · #{order?.order_number ?? "—"}
                  </span>
                  <span>{formatDateTime(job.last_attempt_at ?? job.created_at)}</span>
                  <span>Apri dettagli</span>
                </button>
              );
            })}
          </div>
        </details>
      )}

      <div className="cashier-board">
        <CashierColumn title="Nuove comande" count={newOrders.length}>
          {newOrders.map((order) => {
            const job = jobFor(order.id, "new_order");
            const needsStaffCheck =
              job && ["printing", "failed"].includes(job.status);
            return (
              <OrderCard
                order={order}
                key={order.id}
                printStatus={job ? printStatusLabel(job) : "Stampa in preparazione"}
                actions={
                  needsStaffCheck && job ? (
                    <>
                      <button
                        disabled={!canWrite}
                        onClick={() => openManualConfirmation(order, [job])}
                      >
                        Segna come stampata
                      </button>
                      <button
                        className="button-warning"
                        disabled={!canWrite}
                        onClick={() => openRetryConfirmation(order, job)}
                      >
                        Riprova stampa
                      </button>
                    </>
                  ) : null
                }
              />
            );
          })}
        </CashierColumn>
        <CashierColumn title="In attesa di stampa" count={waitingPrint.length}>
          {waitingPrint.map((order) => {
            const job = jobFor(order.id, "new_order");
            return (
              <OrderCard
                order={order}
                key={order.id}
                printStatus={job ? printStatusLabel(job) : undefined}
                actions={
                  <>
                    <button onClick={() => openPreview(order, "new_order")}>
                      Apri preview
                    </button>
                    {job && ["printing", "failed"].includes(job.status) ? (
                      <>
                        <button
                          disabled={!canWrite}
                          onClick={() => openManualConfirmation(order, [job])}
                        >
                          Segna come stampata
                        </button>
                        <button
                          className="button-warning"
                          disabled={!canWrite}
                          onClick={() => openRetryConfirmation(order, job)}
                        >
                          Riprova stampa
                        </button>
                      </>
                    ) : (
                      <button
                        className="button-primary"
                        disabled={!canWrite}
                        onClick={() => void dispatchPrint(order, "new_order")}
                      >
                        Stampa
                      </button>
                    )}
                  </>
                }
              />
            );
          })}
        </CashierColumn>
        <CashierColumn title="Lavorazione / conto" count={preparing.length}>
          {preparing.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              actions={
                <>
                  <button
                    disabled={!canWrite}
                    onClick={() => openReprintConfirmation(order)}
                  >
                    Ristampa
                  </button>
                  <button
                    className="button-primary"
                    disabled={!canWrite || closingOrderId !== null}
                    onClick={() => void closeTableAndPrint(order)}
                  >
                    {closingOrderId === order.id
                      ? "Stampa e chiude…"
                      : order.order_type === "takeaway"
                        ? "Chiudi asporto"
                        : "Chiudi tavolo"}
                  </button>
                </>
              }
            />
          ))}
        </CashierColumn>
        <CashierColumn title="Ordini attivi" count={filtered.length}>
          {filtered.map((order) => (
            <button
              className="active-table-row"
              key={order.id}
              onClick={() => openPreview(order, "new_order")}
            >
              <strong>
                {order.order_type === "takeaway"
                  ? `A · ${order.takeaway_name ?? "Cliente"}`
                  : `T${order.table?.table_number}`}
              </strong>
              <span>#{order.order_number}</span>
              <span>{formatCurrency(order.total)}</span>
            </button>
          ))}
        </CashierColumn>
      </div>

      {selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="ticket-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Preview 80 mm</p>
                <h2>{JOB_LABELS[selected.type]} · Comanda #{selected.order.order_number}</h2>
              </div>
              <button className="text-button" onClick={() => setSelected(null)}>Chiudi</button>
            </div>
            {!printer?.available && (
              <p className="printer-warning">
                PrintNode o Dell non disponibili: usa la stampa browser e conferma il fallback.
              </p>
            )}
            <div className="ticket-preview print-area">
              {Array.from({ length: getPreviewCopies(selected, jobs, settings) }, (_, index) => (
                <PrintTicket
                  order={selected.order}
                  label={JOB_LABELS[selected.type]}
                  key={index}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" disabled={!canWrite} onClick={() => window.print()}>
                Stampa dal browser
              </button>
              {selected.jobId &&
                ["pending", "printing", "failed"].includes(
                  jobFor(selected.order.id, selected.type)?.status ?? "",
                ) && (
                <button
                  className="button button-primary"
                  disabled={!canWrite}
                  onClick={() => {
                    const job = jobFor(selected.order.id, selected.type);
                    if (job) {
                      setSelected(null);
                      openManualConfirmation(selected.order, [job]);
                    }
                  }}
                >
                  Segna come stampata
                </button>
              )}
              {!["closed", "cancelled"].includes(selected.order.status) && (
                <button
                  className="button button-danger"
                  disabled={!canWrite}
                  onClick={() => void cancelAndPrint(selected.order)}
                >
                  Annulla ordine
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {confirmation?.kind === "manual" && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="print-confirmation-modal">
            <p className="eyebrow">Conferma manuale</p>
            <h2>
              {confirmation.jobs.length > 1
                ? `Completa ${confirmation.jobs.length} stampe del tavolo`
                : "Segna come stampata"}
            </h2>
            <p className="confirmation-warning">
              Usa questa azione solo se il foglio è già uscito fisicamente dalla
              stampante. Non verrà inviata nessuna nuova stampa.
            </p>
            <ul className="confirmation-job-list">
              {confirmation.jobs.map((job) => (
                <li key={job.id}>
                  <strong>{JOB_LABELS[job.job_type]}</strong>
                  <span>
                    {getPrintJobStatusLabel(job)}
                    {job.printnode_job_id
                      ? ` · PrintNode #${job.printnode_job_id}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={busyJobId !== null}
                onClick={closePrintConfirmation}
              >
                Torna indietro
              </button>
              <button
                className="button button-primary"
                disabled={!canWrite || busyJobId !== null}
                onClick={() => void confirmPrintedManually(confirmation)}
              >
                Confermo: i fogli sono usciti
              </button>
            </div>
          </section>
        </div>
      )}

      {(confirmation?.kind === "retry" ||
        confirmation?.kind === "reprint") && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="print-confirmation-modal">
            <p className="eyebrow">Ristampa consapevole</p>
            <h2>
              {confirmation.kind === "retry"
                ? "Riprova stampa"
                : "Crea una ristampa"}
            </h2>
            <p className="confirmation-warning">
              La stampa originale potrebbe essere già uscita. Continuando puoi
              produrre un doppione; verrà creato un nuovo tentativo collegato e
              tracciato.
            </p>
            {confirmation.job && (
              <dl className="print-details">
                <div>
                  <dt>Job originale</dt>
                  <dd>{JOB_LABELS[confirmation.job.job_type]}</dd>
                </div>
                <div>
                  <dt>Stato</dt>
                  <dd>{getPrintJobStatusLabel(confirmation.job)}</dd>
                </div>
                <div>
                  <dt>Ultimo tentativo</dt>
                  <dd>
                    {formatDateTime(
                      confirmation.job.last_attempt_at ??
                        confirmation.job.created_at,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>PrintNode</dt>
                  <dd>{confirmation.job.printnode_job_id ?? "non registrato"}</dd>
                </div>
              </dl>
            )}
            <label className="retry-reason">
              Motivo
              <textarea
                value={retryReason}
                maxLength={500}
                onChange={(event) => setRetryReason(event.target.value)}
              />
            </label>
            <label className="risk-confirmation">
              <input
                type="checkbox"
                checked={riskAccepted}
                onChange={(event) => setRiskAccepted(event.target.checked)}
              />
              Ho verificato la stampante e accetto il rischio di un doppione.
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={busyJobId !== null}
                onClick={closePrintConfirmation}
              >
                Annulla
              </button>
              <button
                className="button button-danger"
                disabled={
                  !canWrite ||
                  !riskAccepted ||
                  !retryReason.trim() ||
                  busyJobId !== null
                }
                onClick={() => void confirmRetryOrReprint(confirmation)}
              >
                Confermo il rischio e ristampa
              </button>
            </div>
          </section>
        </div>
      )}

      {detailsJob && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="print-confirmation-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Dettagli tecnici</p>
                <h2>{JOB_LABELS[detailsJob.job_type]}</h2>
              </div>
              <button className="text-button" onClick={() => setDetailsJob(null)}>
                Chiudi
              </button>
            </div>
            <dl className="print-details">
              <div><dt>Stato</dt><dd>{getPrintJobStatusLabel(detailsJob)}</dd></div>
              <div><dt>Tentativo</dt><dd>{detailsJob.attempt_number}</dd></div>
              <div><dt>Ultimo tentativo</dt><dd>{formatOptionalDate(detailsJob.last_attempt_at)}</dd></div>
              <div><dt>Invio accettato</dt><dd>{formatOptionalDate(detailsJob.submitted_at)}</dd></div>
              <div><dt>PrintNode job</dt><dd>{detailsJob.printnode_job_id ?? "—"}</dd></div>
              <div><dt>Ultimo stato PrintNode</dt><dd>{detailsJob.last_printnode_state ?? "—"}</dd></div>
              <div><dt>Ultimo controllo</dt><dd>{formatOptionalDate(detailsJob.last_state_checked_at)}</dd></div>
              <div><dt>Conferma manuale</dt><dd>{detailsJob.manually_confirmed ? "Sì" : "No"}</dd></div>
            </dl>
            {detailsJob.manual_confirmation_note && (
              <p className="print-detail-note">
                <strong>Nota manuale:</strong> {detailsJob.manual_confirmation_note}
              </p>
            )}
            {detailsJob.technical_error && (
              <details className="technical-error">
                <summary>Errore tecnico</summary>
                <code>{detailsJob.technical_error}</code>
              </details>
            )}
          </section>
        </div>
      )}
    </>
  );

  function openPreview(order: Order, type: PrintJobType) {
    setSelected({ order, type, jobId: jobFor(order.id, type)?.id });
  }

  async function closeTableAndPrint(order: Order) {
    if (!canWrite || closingOrderId) return;
    setClosingOrderId(order.id);

    try {
      const response = await fetch("/api/close-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const payload = (await response.json()) as {
        error?: string;
        closed?: boolean;
        copies?: number;
        idempotent?: boolean;
      };

      if (!response.ok || !payload.closed) {
        setMessage(
          payload.error ??
          `Stampa non riuscita. ${order.order_type === "takeaway" ? "Asporto" : "Tavolo"} non chiuso`,
        );
        return;
      }

      setSelected(null);
      setMessage(
        payload.idempotent
          ? `${order.order_type === "takeaway" ? "Asporto" : "Tavolo"} già chiuso`
          : `Scontrino stampato (${payload.copies ?? 1} copia) · ${
              order.order_type === "takeaway" ? "asporto" : "tavolo"
            } chiuso`,
      );
    } catch {
      markUnreliable();
      setMessage("Connessione non affidabile: verifica stampa e stato dell’ordine");
    } finally {
      setClosingOrderId(null);
      await load();
      await refreshPrinter();
    }
  }

  async function cancelAndPrint(order: Order) {
    if (!canWrite) return;
    const { error } = await createClient().rpc("cancel_order", { p_order_id: order.id });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      return;
    }
    setSelected(null);
    await load();
    await dispatchPrint(order, "cancellation");
  }

  async function dispatchPrint(
    order: Order,
    type: PrintJobType,
    options?: {
      operation?: "dispatch" | "retry";
      jobId?: string;
      actionKey?: string;
      reason?: string;
    },
  ) {
    if (!canWrite) return;
    setBusyJobId(options?.jobId ?? order.id);
    try {
      const response = await fetch("/api/print-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, type, ...options }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        idempotent?: boolean;
        outcome?:
          | "submitted"
          | "printed"
          | "already_submitted"
          | "accepted_state_pending"
          | "verification_required"
          | "failed"
          | "retry_required";
      };

      if (!response.ok && response.status !== 202) {
        setMessage(
          payload.error ??
            "Stampa non riuscita. Controlla i dettagli del job prima di riprovare.",
        );
      } else if (
        response.status === 202 ||
        ["accepted_state_pending", "verification_required"].includes(
          payload.outcome ?? "",
        )
      ) {
        setMessage(
          payload.message ??
            payload.error ??
            "Stampa già presa in carico: verifica il foglio, senza inviare di nuovo.",
        );
      } else {
        setMessage(
          payload.outcome === "printed"
            ? `${JOB_LABELS[type]} completata`
            : payload.idempotent
              ? `${JOB_LABELS[type]} già presa in carico: nessun doppio invio`
              : `${JOB_LABELS[type]} accettata da PrintNode`,
        );
      }
    } catch {
      markUnreliable();
      setMessage(
        "Connessione non affidabile. Non ristampare subito: verifica prima il foglio.",
      );
    } finally {
      setBusyJobId(null);
    }
    await load();
    await refreshPrinter();
  }

  function openManualConfirmation(order: Order, targetJobs: PrintJob[]) {
    setConfirmation({ kind: "manual", order, jobs: targetJobs });
  }

  function openRetryConfirmation(order: Order, job: PrintJob) {
    setRetryReason("Ristampa forzata dopo verifica in cassa");
    setRiskAccepted(false);
    setConfirmation({
      kind: "retry",
      order,
      job,
      actionKey: crypto.randomUUID(),
    });
  }

  function openReprintConfirmation(order: Order) {
    const sourceJob =
      jobs.find(
        (job) =>
          job.order_id === order.id &&
          job.job_type === "new_order" &&
          job.status === "printed",
      ) ?? null;
    setRetryReason("Ristampa richiesta dalla cassa");
    setRiskAccepted(false);
    setConfirmation({
      kind: "reprint",
      order,
      job: sourceJob,
      actionKey: crypto.randomUUID(),
    });
  }

  function closePrintConfirmation() {
    setConfirmation(null);
    setRiskAccepted(false);
  }

  async function confirmPrintedManually(
    target: Extract<PrintConfirmation, { kind: "manual" }>,
  ) {
    if (!canWrite) return;
    const note =
      "Confermato manualmente dalla cassa perché stampato fisicamente ma stato non aggiornato";
    setBusyJobId(target.jobs[0]?.id ?? target.order.id);
    const supabase = createClient();
    const result =
      target.jobs.length === 1
        ? await supabase.rpc("confirm_print_job_manual", {
            p_job_id: target.jobs[0].id,
            p_note: note,
          })
        : await supabase.rpc("confirm_table_print_jobs", {
            p_order_id: target.order.id,
            p_job_ids: target.jobs.map((job) => job.id),
            p_note: note,
          });
    const { error } = result;
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      setBusyJobId(null);
      return;
    }
    closePrintConfirmation();
    setBusyJobId(null);
    setMessage(
      target.jobs.length === 1
        ? "Stampa confermata manualmente. Nessun nuovo invio eseguito."
        : `${target.jobs.length} stampe del tavolo confermate manualmente.`,
    );
    await load();
  }

  async function confirmRetryOrReprint(
    target: Extract<PrintConfirmation, { kind: "retry" | "reprint" }>,
  ) {
    if (!riskAccepted || !retryReason.trim()) return;
    closePrintConfirmation();
    await dispatchPrint(
      target.order,
      "reprint",
      target.kind === "retry"
        ? {
            operation: "retry",
            jobId: target.job.id,
            actionKey: target.actionKey,
            reason: retryReason.trim(),
          }
        : {
            operation: "dispatch",
            actionKey: target.actionKey,
            reason: retryReason.trim(),
          },
    );
  }

  async function cancelQueuedPrintJob(job: PrintJob) {
    if (!canWrite || !canSafelyCancelPrintJob(job)) return;
    setBusyJobId(job.id);
    const { error } = await createClient().rpc("cancel_print_job", {
      p_job_id: job.id,
      p_note: "Job annullato dalla cassa prima dell’invio",
    });
    setBusyJobId(null);
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      return;
    }
    setMessage("Job annullato senza inviare alcuna stampa.");
    await load();
  }
}

function CashierColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="cashier-column">
      <header><h2>{title}</h2><span>{count}</span></header>
      <div className="cashier-column-body">
        {count ? children : <p className="column-empty">Nessuna comanda</p>}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  actions,
  printStatus,
}: {
  order: Order;
  actions: React.ReactNode;
  printStatus?: string;
}) {
  return (
    <article className="cashier-card">
      <header>
        <div>
          <span className="eyebrow">#{order.order_number}</span>
          <h3>{getOrderLocationLabel(order)}</h3>
        </div>
        <time>{formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</time>
      </header>
      <p className="card-meta">
        <span>
          {order.order_type === "takeaway" && order.takeaway_pickup_at
            ? `Ritiro ${formatTime(order.takeaway_pickup_at)}`
            : `${order.cover_count} coperti`}
        </span>
        <span aria-hidden="true"> · </span>
        <span className="card-waiter">{order.waiter?.full_name ?? "Staff"}</span>
      </p>
      {printStatus && <p className="card-print-status">{printStatus}</p>}
      <ul>
        {order.items?.map((item) => (
          <li key={item.id}>
            <strong>{item.quantity}×</strong> {item.item_name_snapshot}
            {item.notes && <small>{item.notes}</small>}
          </li>
        ))}
      </ul>
      {order.general_notes && (
        <p className="card-note"><strong>Nota:</strong> {order.general_notes}</p>
      )}
      <div className="card-total">
        <span>Totale</span>
        <strong>{formatCurrency(order.total)}</strong>
      </div>
      <div className="card-actions">{actions}</div>
    </article>
  );
}

function printStatusLabel(job: PrintJob) {
  const label = JOB_LABELS[job.job_type];
  return `${label} — ${getPrintJobStatusLabel(job).toLowerCase()}`;
}

function isCurrentServiceJob(
  job: PrintJob,
  orderById: Map<string, Order>,
  currentServiceId?: string,
) {
  const order = orderById.get(job.order_id);
  if (!order) return false;
  if (currentServiceId) return order.service_id === currentServiceId;
  return ACTIVE.includes(order.status);
}

function formatOptionalDate(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

function getPreviewCopies(
  selected: SelectedTicket,
  jobs: PrintJob[],
  settings: RestaurantSettings | null,
) {
  const job = jobs.find(
    (candidate) =>
      candidate.order_id === selected.order.id &&
      candidate.job_type === selected.type,
  );
  if (job) return job.copies;
  if (selected.order.order_type === "takeaway") {
    return settings?.takeaway_print_copies ?? 1;
  }
  return settings?.dine_in_print_copies ?? 3;
}
