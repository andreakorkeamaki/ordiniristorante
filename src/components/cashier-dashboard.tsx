"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { PrintReceipt } from "@/components/print-receipt";
import { PrintTicket } from "@/components/print-ticket";
import { ServiceControl } from "@/components/service-control";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";
import { getOrderLocationLabel, getOrderShortLabel } from "@/lib/order-display";
import {
  aggregateIdenticalOrderItems,
} from "@/lib/order-items";
import { groupOrderItemsByPrintDepartment } from "@/lib/print-ticket-format";
import {
  canSafelyCancelPrintJob,
  getPrintJobDisplayState,
  getPrintJobStatusLabel,
  getStaffPrintMessage,
} from "@/lib/print-job-state";
import { readFailureState } from "@/lib/reliable-data-state";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  Order,
  OrderItem,
  PrintJob,
  PrintJobType,
  Profile,
  RestaurantTable,
} from "@/types/domain";

const ACTIVE = ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"];
const HISTORY_PAGE_SIZE = 50;
const JOB_LABELS: Record<PrintJobType, string> = {
  new_order: "NUOVA COMANDA",
  order_update: "AGGIORNAMENTO COMANDA",
  cancellation: "ANNULLAMENTO",
  reprint: "RISTAMPA",
  receipt: "SCONTRINO",
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
  reason?:
    | "available"
    | "not_configured"
    | "api_unreachable"
    | "timeout"
    | "computer_disconnected"
    | "printer_offline"
    | "printer_not_found";
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
  const {
    canWrite: connectionCanWrite,
    blockReason,
    markUnreliable,
  } = useConnection();
  const {
    service,
    loading: serviceLoading,
    error: serviceError,
    state: serviceState,
    reload: reloadService,
  } = useCurrentService();
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [filter, setFilter] = useState("");
  const [waiterFilter, setWaiterFilter] = useState("");
  const [selected, setSelected] = useState<SelectedTicket | null>(null);
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
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
  const [dataState, setDataState] = useState<"loading" | "ready" | "stale" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [receiptTarget, setReceiptTarget] = useState<{
    order: Order;
    job: PrintJob;
  } | null>(null);
  const [receiptPrintedManually, setReceiptPrintedManually] = useState(false);
  const [receiptRetryAccepted, setReceiptRetryAccepted] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadGeneration = useRef(0);
  const hasSnapshot = useRef(false);
  const canWrite =
    connectionCanWrite && dataState === "ready" && serviceState === "ready";

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const supabase = createClient();
    const [activeOrdersResult, tablesResult, profilesResult, operationalJobsResult, historyJobsResult] = await Promise.all([
      supabase.from("orders").select("*").in("status", ACTIVE).order("created_at"),
      supabase.from("restaurant_tables").select("*"),
      supabase.from("profiles").select("id, full_name, role, active"),
      loadAllOperationalPrintJobs(supabase),
      supabase
        .from("print_jobs")
        .select("*")
        .in("status", ["printed", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE),
    ]);
    const firstError =
      activeOrdersResult.error ??
      tablesResult.error ??
      profilesResult.error ??
      operationalJobsResult.error ??
      historyJobsResult.error;
    if (firstError) {
      if (!firstError.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Dati cassa non aggiornati. Riprova prima di eseguire operazioni.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }

    const rawJobs = [
      ...((operationalJobsResult.data ?? []) as PrintJob[]),
      ...((historyJobsResult.data ?? []) as PrintJob[]),
    ];
    const activeOrders = (activeOrdersResult.data ?? []) as Order[];
    const activeIds = new Set(activeOrders.map((order) => order.id));
    const missingIds = [...new Set(rawJobs.map((job) => job.order_id).filter((id) => !activeIds.has(id)))];
    const queuedOrdersResult = missingIds.length
      ? await loadOrdersByIds(supabase, missingIds)
      : { data: [], error: null };
    if (queuedOrdersResult.error) {
      if (!queuedOrdersResult.error.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Ordini collegati alla coda non disponibili.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    const rawOrders = [
      ...activeOrders,
      ...((queuedOrdersResult.data ?? []) as Order[]).filter((order) => !activeIds.has(order.id)),
    ];
    const orderIds = rawOrders.map((order) => order.id);
    const linesResult = orderIds.length
      ? await loadOrderLinesByIds(supabase, orderIds)
      : { data: [], error: null };
    if (linesResult.error) {
      if (!linesResult.error.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Righe ordine non aggiornate.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    if (generation !== loadGeneration.current) return;
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
    const historyPage = (historyJobsResult.data ?? []) as PrintJob[];
    setHistoryCursor(historyPage.at(-1)?.created_at ?? null);
    setHistoryHasMore(historyPage.length === HISTORY_PAGE_SIZE);
    hasSnapshot.current = true;
    setLoadError("");
    setDataState("ready");
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
        message:
          error instanceof TypeError
            ? "Server dell’app non raggiungibile"
            : "Stato PrintNode non disponibile",
        reason: "api_unreachable",
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
    ["pending", "printing", "failed"].includes(job.status),
  );
  const historicalJobs = jobs.filter((job) =>
    ["printed", "cancelled"].includes(job.status),
  );

  if (loading && dataState === "loading") {
    return <div className="loader" aria-label="Caricamento cassa" />;
  }

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
          {printer && !printer.available && (
            <small>{printerAction(printer.reason)}</small>
          )}
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
          {dataState === "ready" && serviceState === "ready"
            ? blockReason
            : serviceError || loadError} Le azioni di cassa e
          stampa restano disabilitate.
          {dataState !== "ready" && (
            <button className="text-button" onClick={() => void load()}>
              Riprova
            </button>
          )}
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
                candidate.job_type !== "receipt" &&
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
                    {order ? getOrderShortLabel(order) : "Ordine —"} ·{" "}
                    {job.job_type === "receipt" ? "1 copia" : "3 copie identiche"}
                    {job.printnode_job_id ? ` · PrintNode #${job.printnode_job_id}` : ""}
                    {job.last_attempt_at
                      ? ` · ultimo tentativo ${formatDateTime(job.last_attempt_at)}`
                      : ""}
                  </p>
                  {staffMessage && <small>{staffMessage}</small>}
                </div>
                <div className="print-job-actions">
                  {job.status === "pending" && order && job.job_type === "receipt" && (
                    <button
                      disabled={!canWrite || busyJobId === job.id}
                      onClick={() => setReceiptTarget({ order, job })}
                    >
                      Apri scontrino
                    </button>
                  )}
                  {job.status === "pending" && order && job.job_type !== "receipt" && (
                    <button
                      disabled={!canWrite || busyJobId === job.id}
                      onClick={() => void dispatchPrint(order, job.job_type)}
                    >
                      Avvia stampa
                    </button>
                  )}
                  {["printing", "failed"].includes(job.status) &&
                    order &&
                    job.job_type === "receipt" && (
                    <button
                      disabled={!canWrite || busyJobId !== null}
                      onClick={() => setReceiptTarget({ order, job })}
                    >
                      Verifica scontrino
                    </button>
                  )}
                  {["printing", "failed"].includes(job.status) &&
                    order &&
                    job.job_type !== "receipt" && (
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
                  {job.job_type !== "receipt" && canSafelyCancelPrintJob(job) && (
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

      {historicalJobs.length > 0 && (
        <details className="historical-print-jobs">
          <summary>
            Storico stampe recente ({historicalJobs.length})
          </summary>
          <div className="print-job-list">
            {historicalJobs.map((job) => {
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
          {historyHasMore && (
            <button
              className="button button-secondary"
              disabled={historyLoading}
              onClick={() => void loadMoreHistory()}
            >
              {historyLoading ? "Caricamento…" : "Carica storico precedente"}
            </button>
          )}
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
                    onClick={() => void prepareReceipt(order)}
                  >
                    {closingOrderId === order.id
                      ? "Prepara scontrino…"
                      : order.order_type === "takeaway"
                        ? "Scontrino e chiudi asporto"
                        : "Scontrino e chiudi tavolo"}
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
              {groupOrderItemsByPrintDepartment(selected.order.items ?? []).map((department) => (
                <PrintTicket
                  department={department}
                  order={selected.order}
                  label={JOB_LABELS[selected.type]}
                  key={department.area}
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

      {receiptTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="ticket-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Preview scontrino reale</p>
                <h2>Scontrino · Ordine #{receiptTarget.order.order_number}</h2>
              </div>
              <button
                className="text-button"
                disabled={closingOrderId !== null}
                onClick={() => {
                  setReceiptTarget(null);
                  setReceiptPrintedManually(false);
                  setReceiptRetryAccepted(false);
                }}
              >
                Chiudi
              </button>
            </div>
            <div className="ticket-preview print-area">
              <PrintReceipt order={receiptTarget.order} />
            </div>
            <p className="confirmation-warning">
              Il tavolo resta aperto finché PrintNode conferma il job oppure
              confermi esplicitamente la stampa manuale.
            </p>
            <label className="risk-confirmation">
              <input
                type="checkbox"
                checked={receiptPrintedManually}
                onChange={(event) => setReceiptPrintedManually(event.target.checked)}
              />
              Confermo che lo scontrino è già uscito o è stato stampato dal browser.
            </label>
            {["printing", "failed"].includes(receiptTarget.job.status) && (
              <label className="risk-confirmation">
                <input
                  type="checkbox"
                  checked={receiptRetryAccepted}
                  onChange={(event) => setReceiptRetryAccepted(event.target.checked)}
                />
                Ho verificato la stampante e accetto che un nuovo tentativo possa
                produrre un doppione.
              </label>
            )}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={!canWrite || closingOrderId !== null}
                onClick={() => window.print()}
              >
                Stampa dal browser
              </button>
              {receiptTarget.job.status === "pending" && (
                <button
                  className="button button-secondary"
                  disabled={!canWrite || closingOrderId !== null}
                  onClick={() =>
                    void closeTableAndPrint(
                      receiptTarget.order,
                      receiptTarget.job,
                    )
                  }
                >
                  Invia 1 copia a PrintNode
                </button>
              )}
              {["printing", "failed"].includes(receiptTarget.job.status) && (
                <button
                  className="button button-danger"
                  disabled={
                    !canWrite ||
                    !receiptRetryAccepted ||
                    closingOrderId !== null
                  }
                  onClick={() => void retryReceipt(receiptTarget)}
                >
                  Crea retry tracciato
                </button>
              )}
              <button
                className="button button-primary"
                disabled={
                  !canWrite ||
                  !receiptPrintedManually ||
                  closingOrderId !== null
                }
                onClick={() => void confirmReceiptManually(receiptTarget)}
              >
                Conferma stampa manuale e chiudi
              </button>
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
              <p className="print-detail-note">
                I dettagli tecnici sono stati conservati nel log operativo.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );

  function openPreview(order: Order, type: PrintJobType) {
    setSelected({ order, type, jobId: jobFor(order.id, type)?.id });
  }

  async function prepareReceipt(order: Order) {
    if (!canWrite || closingOrderId) return;
    setClosingOrderId(order.id);
    try {
      const response = await fetch("/api/close-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", orderId: order.id }),
      });
      const payload = (await response.json()) as {
        error?: string;
        action?: string;
        job?: PrintJob;
      };
      if (!response.ok || !payload.job) {
        setMessage([payload.error, payload.action].filter(Boolean).join(" "));
        return;
      }
      setReceiptPrintedManually(false);
      setReceiptRetryAccepted(false);
      setReceiptTarget({ order, job: payload.job });
    } catch {
      markUnreliable();
      setMessage("Server non raggiungibile. Nessuna chiusura è stata eseguita.");
    } finally {
      setClosingOrderId(null);
      await load();
    }
  }

  async function loadMoreHistory() {
    if (!historyCursor || historyLoading) return;
    setHistoryLoading(true);
    const { data, error } = await createClient()
      .from("print_jobs")
      .select("*")
      .in("status", ["printed", "cancelled"])
      .lt("created_at", historyCursor)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE_SIZE);
    if (error) {
      if (!error.code) markUnreliable();
      setMessage("Storico stampa non disponibile. Riprova.");
      setHistoryLoading(false);
      return;
    }
    const page = (data ?? []) as PrintJob[];
    const knownOrderIds = new Set(orders.map((order) => order.id));
    const missingOrderIds = [
      ...new Set(
        page
          .map((job) => job.order_id)
          .filter((orderId) => !knownOrderIds.has(orderId)),
      ),
    ];
    if (missingOrderIds.length) {
      const orderResult = await loadOrdersByIds(createClient(), missingOrderIds);
      if (!orderResult.error) {
        setOrders((current) => {
          const byId = new Map(current.map((order) => [order.id, order]));
          for (const order of orderResult.data ?? []) byId.set(order.id, order);
          return [...byId.values()];
        });
      }
    }
    setJobs((current) => {
      const byId = new Map(current.map((job) => [job.id, job]));
      for (const job of page) byId.set(job.id, job);
      return [...byId.values()];
    });
    setHistoryCursor(page.at(-1)?.created_at ?? null);
    setHistoryHasMore(page.length === HISTORY_PAGE_SIZE);
    setHistoryLoading(false);
  }

  async function closeTableAndPrint(order: Order, receiptJob?: PrintJob) {
    if (!canWrite || closingOrderId) return;
    setClosingOrderId(order.id);

    try {
      const response = await fetch("/api/close-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          orderId: order.id,
          jobId: receiptJob?.id,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        action?: string;
        message?: string;
        closed?: boolean;
        copies?: number;
        idempotent?: boolean;
        job?: PrintJob;
      };

      if (!payload.closed) {
        if (payload.job) {
          setReceiptTarget({ order, job: payload.job });
        }
        setMessage(
          [payload.error ?? payload.message, payload.action]
            .filter(Boolean)
            .join(" ") ||
          `Scontrino non confermato. ${order.order_type === "takeaway" ? "Asporto" : "Tavolo"} ancora aperto`,
        );
        return;
      }

      setSelected(null);
      setReceiptTarget(null);
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

  async function retryReceipt(target: { order: Order; job: PrintJob }) {
    if (!canWrite || !receiptRetryAccepted || closingOrderId) return;
    setClosingOrderId(target.order.id);
    try {
      const response = await fetch("/api/close-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry",
          orderId: target.order.id,
          jobId: target.job.id,
          actionKey: crypto.randomUUID(),
          reason: "Retry scontrino dopo verifica fisica della stampante in cassa",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        action?: string;
        message?: string;
        closed?: boolean;
        job?: PrintJob;
      };
      if (payload.job) {
        setReceiptTarget({ order: target.order, job: payload.job });
      }
      setMessage(
        [payload.error ?? payload.message, payload.action]
          .filter(Boolean)
          .join(" "),
      );
      if (payload.closed) {
        setReceiptTarget(null);
      }
      setReceiptRetryAccepted(false);
    } catch {
      markUnreliable();
      setMessage("Retry non confermato dal server. Non inviare un altro tentativo.");
    } finally {
      setClosingOrderId(null);
      await load();
    }
  }

  async function confirmReceiptManually(target: {
    order: Order;
    job: PrintJob;
  }) {
    if (!canWrite || !receiptPrintedManually || closingOrderId) return;
    setClosingOrderId(target.order.id);
    try {
      const response = await fetch("/api/close-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_confirm",
          orderId: target.order.id,
          jobId: target.job.id,
          expectedVersion: target.order.version,
          note: "Scontrino uscito o stampato manualmente e verificato dalla cassa",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        action?: string;
        closed?: boolean;
      };
      if (!response.ok || !payload.closed) {
        setMessage([payload.error, payload.action].filter(Boolean).join(" "));
        return;
      }
      setReceiptTarget(null);
      setReceiptPrintedManually(false);
      setMessage("Stampa manuale auditata e ordine chiuso.");
    } catch {
      markUnreliable();
      setMessage(
        "Conferma non ricevuta dal server: verifica lo stato prima di ripetere.",
      );
    } finally {
      setClosingOrderId(null);
      await load();
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
        {aggregateIdenticalOrderItems(order.items ?? []).map((item) => (
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

function formatOptionalDate(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

async function loadAllOperationalPrintJobs(
  supabase: ReturnType<typeof createClient>,
) {
  const pageSize = 500;
  const jobs: PrintJob[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("print_jobs")
      .select("*")
      .in("status", ["pending", "printing", "failed"])
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as PrintJob[];
    jobs.push(...page);
    if (page.length < pageSize) return { data: jobs, error: null };
  }
}

async function loadOrdersByIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
) {
  const rows: Order[] = [];
  for (const chunk of chunkValues(ids, 100)) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("id", chunk);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as Order[]));
  }
  return { data: rows, error: null };
}

async function loadOrderLinesByIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
) {
  const rows: OrderItem[] = [];
  for (const chunk of chunkValues(ids, 100)) {
    const { data, error } = await supabase
      .from("order_items")
      .select("*, extras:order_item_extras(*)")
      .in("order_id", chunk)
      .order("created_at");
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as OrderItem[]));
  }
  return { data: rows, error: null };
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function printerAction(reason: PrinterStatus["reason"]) {
  if (reason === "not_configured") {
    return "Usa la stampa browser e segnala la configurazione mancante.";
  }
  if (reason === "computer_disconnected") {
    return "Avvia o riconnetti il client PrintNode sul computer Dell.";
  }
  if (reason === "printer_offline") {
    return "Controlla alimentazione, carta e collegamento della stampante.";
  }
  if (reason === "timeout") {
    return "Non ristampare subito: verifica prima se il foglio è uscito.";
  }
  return "Verifica la rete; per lo scontrino è disponibile il fallback browser.";
}
