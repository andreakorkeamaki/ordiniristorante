"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrintTicket } from "@/components/print-ticket";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
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
  new_order: "NUOVO ORDINE",
  order_update: "AGGIORNAMENTO",
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
        .in("status", ["pending", "printing", "failed"])
        .order("created_at", { ascending: false }),
    ]);

    const rawJobs = (jobsResult.data ?? []) as PrintJob[];
    const activeOrders = (activeOrdersResult.data ?? []) as Order[];
    const activeIds = new Set(activeOrders.map((order) => order.id));
    const missingIds = [...new Set(rawJobs.map((job) => job.order_id).filter((id) => !activeIds.has(id)))];
    const queuedOrdersResult = missingIds.length
      ? await supabase.from("orders").select("*").in("id", missingIds)
      : { data: [] };
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
      : { data: [] };
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
  }, []);

  const refreshPrinter = useCallback(async () => {
    try {
      const response = await fetch("/api/print-order", { cache: "no-store" });
      const payload = (await response.json()) as PrinterStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Stato stampante non disponibile");
      setPrinter(payload);
    } catch (error) {
      setPrinter({
        configured: true,
        available: false,
        printer: null,
        message: error instanceof Error ? error.message : "PrintNode non raggiungibile",
      });
    }
  }, []);

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
      jobFor(order.id, "new_order")?.status === "printed",
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

      <section className="print-queue">
        <div className="print-queue-heading">
          <div>
            <p className="eyebrow">Print jobs</p>
            <h2>Coda stampa</h2>
          </div>
          <span>{jobs.length} job in coda</span>
        </div>
        <div className="print-job-list">
          {jobs.length ? jobs.map((job) => {
            const order = orderById.get(job.order_id);
            return (
              <article className={`print-job-row status-${job.status}`} key={job.id}>
                <div>
                  <strong>{JOB_LABELS[job.job_type]} · #{order?.order_number ?? "—"}</strong>
                  <p>
                    Tavolo {order?.table?.table_number ?? "—"} · 3 copie · {job.status}
                    {job.printnode_job_id ? ` · PrintNode #${job.printnode_job_id}` : ""}
                  </p>
                  {job.error_message && <small>{job.error_message}</small>}
                </div>
                <div className="print-job-actions">
                  {job.status !== "printing" && order && (
                    <button onClick={() => void dispatchPrint(order, job.job_type)}>
                      {job.status === "failed" ? "Riprova" : "Invia"}
                    </button>
                  )}
                  {job.status === "printing" && <button disabled>In invio…</button>}
                  {order && (
                    <button
                      className="button-primary"
                      disabled={
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
          {newOrders.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              actions={
                <>
                  <button onClick={() => void run("confirm_order", order)}>Conferma</button>
                  <button
                    className="button-primary"
                    onClick={() => void confirmAndPrint(order)}
                  >
                    Conferma e stampa
                  </button>
                </>
              }
            />
          ))}
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
                    onClick={() => void dispatchPrint(order, "new_order")}
                  >
                    Stampa
                  </button>
                </>
              }
            />
          ))}
        </CashierColumn>
        <CashierColumn title="Stampate / lavorazione" count={preparing.length}>
          {preparing.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              actions={
                <>
                  <button onClick={() => void dispatchPrint(order, "reprint")}>Ristampa</button>
                  <button
                    className="button-primary"
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
              {["COPIA PIZZERIA", "COPIA CUCINA", "COPIA CASSA"].map((label) => (
                <PrintTicket
                  order={selected.order}
                  label={`${JOB_LABELS[selected.type]} · ${label}`}
                  key={label}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => window.print()}>
                Stampa dal browser
              </button>
              {selected.jobId && jobFor(selected.order.id, selected.type)?.status !== "printing" && (
                <button
                  className="button button-primary"
                  onClick={() => void completeManualFallback(selected.jobId!)}
                >
                  Segna fallback completato
                </button>
              )}
              {!["closed", "cancelled"].includes(selected.order.status) && (
                <button
                  className="button button-danger"
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
    const { error } = await createClient().rpc(name, { p_order_id: order.id });
    if (error) {
      setMessage(error.message);
      return false;
    }
    setSelected(null);
    await load();
    return true;
  }

  async function confirmAndPrint(order: Order) {
    if (await run("confirm_order", order)) {
      await dispatchPrint(order, "new_order");
    }
  }

  async function cancelAndPrint(order: Order) {
    const { error } = await createClient().rpc("cancel_order", { p_order_id: order.id });
    if (error) {
      setMessage(error.message);
      return;
    }
    setSelected(null);
    await load();
    await dispatchPrint(order, "cancellation");
  }

  async function dispatchPrint(order: Order, type: PrintJobType) {
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
    await load();
    await refreshPrinter();
  }

  async function completeManualFallback(jobId: string) {
    const { error } = await createClient().rpc("mark_print_job_manual", {
      p_job_id: jobId,
    });
    if (error) {
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

function OrderCard({ order, actions }: { order: Order; actions: React.ReactNode }) {
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
