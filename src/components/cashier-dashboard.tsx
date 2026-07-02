"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { PrintTicket } from "@/components/print-ticket";
import { ServiceControl } from "@/components/service-control";
import { formatCurrency, formatDateTime } from "@/lib/format";
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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [activeOrdersResult, tablesResult, profilesResult, jobsResult] = await Promise.all([
      supabase.from("orders").select("*").in("status", ACTIVE).order("created_at"),
      supabase.from("restaurant_tables").select("*"),
      supabase.from("profiles").select("id, full_name, role, active"),
      supabase
        .from("print_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const firstError =
      activeOrdersResult.error ??
      tablesResult.error ??
      profilesResult.error ??
      jobsResult.error;
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
        table: tables.get(order.table_id),
        waiter: profiles.get(order.created_by),
        items: lines.filter((line) => line.order_id === order.id),
      })),
    );
    setJobs(rawJobs);
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
          String(order.order_number).includes(filter);
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
            placeholder="Tavolo o comanda"
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
            const recoverable =
              job.status === "failed" ||
              (job.status === "pending" && isOlderThan(job.created_at, 30_000));
            return (
              <article className={`print-job-row status-${job.status}`} key={job.id}>
                <div>
                  <strong>{JOB_LABELS[job.job_type]} · #{order?.order_number ?? "—"}</strong>
                  <p>
                    Tavolo {order?.table?.table_number ?? "—"} · 3 copie · {printStatusLabel(job)}
                    {job.printnode_job_id ? ` · PrintNode #${job.printnode_job_id}` : ""}
                  </p>
                  {job.error_message && <small>{job.error_message}</small>}
                </div>
                <div className="print-job-actions">
                  {recoverable && order && (
                    <button
                      disabled={!canWrite}
                      onClick={() => void dispatchPrint(order, job.job_type)}
                    >
                      {job.status === "failed" ? "Riprova" : "Recupera stampa"}
                    </button>
                  )}
                  {job.status === "printing" && <button disabled>In invio…</button>}
                  {order && (
                    <button
                      className="button-primary"
                      disabled={
                        !canWrite ||
                        job.status === "printing" ||
                        (job.status === "pending" && Boolean(printer?.available))
                      }
                      onClick={() => setSelected({ order, type: job.job_type, jobId: job.id })}
                    >
                      Fallback manuale
                    </button>
                  )}
                </div>
              </article>
            );
          }) : <p className="column-empty">Nessun job in attesa o fallito</p>}
        </div>
      </section>

      <div className="cashier-board">
        <CashierColumn title="Nuove comande" count={newOrders.length}>
          {newOrders.map((order) => {
            const job = jobFor(order.id, "new_order");
            const recoverable =
              job?.status === "failed" ||
              (job?.status === "pending" && isOlderThan(job.created_at, 30_000));
            return (
              <OrderCard
                order={order}
                key={order.id}
                printStatus={job ? printStatusLabel(job) : "Stampa in preparazione"}
                actions={
                  recoverable && job ? (
                    <>
                      <button
                        disabled={!canWrite}
                        onClick={() => void dispatchPrint(order, "new_order")}
                      >
                        Riprova stampa
                      </button>
                      <button
                        className="button-primary"
                        disabled={!canWrite}
                        onClick={() =>
                          setSelected({ order, type: "new_order", jobId: job.id })
                        }
                      >
                        Fallback manuale
                      </button>
                    </>
                  ) : null
                }
              />
            );
          })}
        </CashierColumn>
        <CashierColumn title="In attesa di stampa" count={waitingPrint.length}>
          {waitingPrint.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              actions={
                <>
                  <button onClick={() => openPreview(order, "new_order")}>Apri preview</button>
                  <button
                    className="button-primary"
                    disabled={!canWrite}
                    onClick={() => void dispatchPrint(order, "new_order")}
                  >
                    Stampa
                  </button>
                </>
              }
            />
          ))}
        </CashierColumn>
        <CashierColumn title="Lavorazione / conto" count={preparing.length}>
          {preparing.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              actions={
                <>
                  <button disabled={!canWrite} onClick={() => void dispatchPrint(order, "reprint")}>Ristampa</button>
                  <button
                    className="button-primary"
                    disabled={!canWrite}
                    onClick={() => void run("close_order", order)}
                  >
                    Chiudi tavolo
                  </button>
                </>
              }
            />
          ))}
        </CashierColumn>
        <CashierColumn title="Tavoli attivi" count={filtered.length}>
          {filtered.map((order) => (
            <button
              className="active-table-row"
              key={order.id}
              onClick={() => openPreview(order, "new_order")}
            >
              <strong>T{order.table?.table_number}</strong>
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
              {Array.from({ length: 3 }, (_, index) => (
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
              {selected.jobId && jobFor(selected.order.id, selected.type)?.status !== "printing" && (
                <button
                  className="button button-primary"
                  disabled={!canWrite}
                  onClick={() => void completeManualFallback(selected.jobId!)}
                >
                  Segna fallback completato
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
    </>
  );

  function openPreview(order: Order, type: PrintJobType) {
    setSelected({ order, type, jobId: jobFor(order.id, type)?.id });
  }

  async function run(name: "confirm_order" | "close_order", order: Order) {
    if (!canWrite) return false;
    const { error } = await createClient().rpc(name, { p_order_id: order.id });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      return false;
    }
    setSelected(null);
    await load();
    return true;
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

  async function dispatchPrint(order: Order, type: PrintJobType) {
    if (!canWrite) return;
    try {
      const response = await fetch("/api/print-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, type }),
      });
      const payload = (await response.json()) as {
        error?: string;
        idempotent?: boolean;
        fallback?: "manual";
      };

      if (!response.ok) {
        setMessage(`${payload.error ?? "Stampa non riuscita"} · usa il fallback manuale`);
        openPreview(order, type);
      } else {
        setMessage(
          payload.idempotent
            ? `${JOB_LABELS[type]} già presa in carico`
            : `${JOB_LABELS[type]} inviata a PrintNode`,
        );
      }
    } catch {
      markUnreliable();
      setMessage("Connessione non affidabile. Stampa non confermata.");
    }
    await load();
    await refreshPrinter();
  }

  async function completeManualFallback(jobId: string) {
    if (!canWrite) return;
    const { error } = await createClient().rpc("mark_print_job_manual", {
      p_job_id: jobId,
    });
    if (error) {
      if (!error.code) markUnreliable();
      setMessage(error.message);
      return;
    }
    setSelected(null);
    setMessage("Fallback manuale registrato");
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
          <h3>Tavolo {order.table?.table_number}</h3>
        </div>
        <time>{formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</time>
      </header>
      <p className="card-meta">
        {order.cover_count} coperti · {order.waiter?.full_name ?? "Staff"}
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

function isOlderThan(value: string, milliseconds: number) {
  return Date.now() - new Date(value).getTime() > milliseconds;
}

function printStatusLabel(job: PrintJob) {
  const label = JOB_LABELS[job.job_type];
  if (job.status === "printed") return `${label} — stampata`;
  if (job.status === "failed") return `${label} — ERRORE STAMPA · DA STAMPARE`;
  if (
    job.status === "printing" &&
    job.error_message?.toLowerCase().includes("incerto")
  ) {
    return `${label} — esito stampa incerto`;
  }
  if (job.status === "printing") return `${label} — in stampa`;
  if (job.status === "pending" && isOlderThan(job.created_at, 30_000)) {
    return `${label} — errore avvio stampa`;
  }
  if (job.status === "pending") return `${label} — stampa avviata`;
  return `${label} — stampa annullata`;
}
