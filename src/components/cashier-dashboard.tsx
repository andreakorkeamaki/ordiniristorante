"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrintTicket } from "@/components/print-ticket";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { unconfiguredPrintAdapter } from "@/lib/print-adapter";
import type { Order, OrderItem, PrintJob, Profile, RestaurantTable } from "@/types/domain";

const ACTIVE = ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"];

export function CashierDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<Map<string, PrintJob>>(new Map());
  const [filter, setFilter] = useState("");
  const [waiterFilter, setWaiterFilter] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [ordersResult, tablesResult, profilesResult, jobsResult] = await Promise.all([
      supabase.from("orders").select("*").in("status", ACTIVE).order("created_at"),
      supabase.from("restaurant_tables").select("*"),
      supabase.from("profiles").select("id, full_name, role, active"),
      supabase.from("print_jobs").select("*"),
    ]);
    const rawOrders = (ordersResult.data ?? []) as Order[];
    const orderIds = rawOrders.map((order) => order.id);
    const linesResult = orderIds.length
      ? await supabase.from("order_items").select("*, extras:order_item_extras(*)").in("order_id", orderIds).order("created_at")
      : { data: [] };
    const tables = new Map(((tablesResult.data ?? []) as RestaurantTable[]).map((table) => [table.id, table]));
    const profiles = new Map(((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
    const lines = (linesResult.data ?? []) as OrderItem[];

    setOrders(
      rawOrders.map((order) => ({
        ...order,
        table: tables.get(order.table_id),
        waiter: profiles.get(order.created_by),
        items: lines.filter((line) => line.order_id === order.id),
      })),
    );
    setJobs(new Map(((jobsResult.data ?? []) as PrintJob[]).map((job) => [job.order_id, job])));
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    const channel = supabase
      .channel("cashier-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, load)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const tableMatches =
          !filter ||
          String(order.table?.table_number ?? "").includes(filter) ||
          String(order.order_number).includes(filter);
        const waiterMatches = !waiterFilter || order.created_by === waiterFilter;
        return tableMatches && waiterMatches;
      }),
    [filter, orders, waiterFilter],
  );

  const waiters = [...new Map(orders.filter((order) => order.waiter).map((order) => [order.created_by, order.waiter!])).values()];
  const newOrders = filtered.filter((order) => order.status === "pending_cashier");
  const waitingPrint = filtered.filter((order) => order.status === "confirmed" && jobs.get(order.id)?.status !== "printed");
  const preparing = filtered.filter((order) => order.status === "in_preparation" || jobs.get(order.id)?.status === "printed");

  if (loading) return <div className="loader" aria-label="Caricamento cassa" />;

  return (
    <>
      <section className="workspace-heading cashier-heading">
        <div><p className="eyebrow">Dashboard</p><h1>Cassa</h1><p>Aggiornamento automatico in tempo reale</p></div>
        <div className="cashier-filters">
          <input placeholder="Tavolo o comanda" value={filter} onChange={(event) => setFilter(event.target.value)} />
          <select value={waiterFilter} onChange={(event) => setWaiterFilter(event.target.value)}>
            <option value="">Tutti i camerieri</option>
            {waiters.map((waiter) => <option key={waiter.id} value={waiter.id}>{waiter.full_name}</option>)}
          </select>
        </div>
      </section>
      {message && <button className="external-update" onClick={() => setMessage("")}>{message} · Chiudi</button>}

      <div className="cashier-board">
        <CashierColumn title="Nuove comande" count={newOrders.length}>
          {newOrders.map((order) => <OrderCard order={order} key={order.id} actions={
            <>
              <button onClick={() => void run("confirm_order", order)}>Conferma</button>
              <button className="button-primary" onClick={() => void requestPrint(order)}>Conferma e stampa</button>
            </>
          } />)}
        </CashierColumn>
        <CashierColumn title="In attesa di stampa" count={waitingPrint.length}>
          {waitingPrint.map((order) => <OrderCard order={order} key={order.id} actions={
            <>
              <button onClick={() => setSelected(order)}>Apri preview</button>
              <button className="button-primary" onClick={() => void markPrinted(order)}>Segna stampato</button>
            </>
          } />)}
        </CashierColumn>
        <CashierColumn title="Stampate / lavorazione" count={preparing.length}>
          {preparing.map((order) => <OrderCard order={order} key={order.id} actions={
            <>
              <button onClick={() => void requestPrint(order)}>Ristampa</button>
              <button className="button-primary" onClick={() => void run("close_order", order)}>Chiudi tavolo</button>
            </>
          } />)}
        </CashierColumn>
        <CashierColumn title="Tavoli attivi" count={filtered.length}>
          {filtered.map((order) => (
            <button className="active-table-row" key={order.id} onClick={() => setSelected(order)}>
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
              <div><p className="eyebrow">Preview 80 mm</p><h2>Comanda #{selected.order_number}</h2></div>
              <button className="text-button" onClick={() => setSelected(null)}>Chiudi</button>
            </div>
            <p className="printer-warning">In attesa di configurazione stampante · fallback browser disponibile</p>
            <div className="ticket-preview print-area">
              {["COPIA PIZZERIA", "COPIA CUCINA", "COPIA CASSA"].map((label) => (
                <PrintTicket order={selected} label={label} key={label} />
              ))}
            </div>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => window.print()}>Stampa dal browser</button>
              <button className="button button-primary" onClick={() => void markPrinted(selected)}>Segna stampato</button>
              <button className="button button-danger" onClick={() => void run("cancel_order", selected)}>Annulla ordine</button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  async function run(name: "confirm_order" | "close_order" | "cancel_order", order: Order) {
    const { error } = await createClient().rpc(name, { p_order_id: order.id });
    if (error) setMessage(error.message);
    else {
      setSelected(null);
      await load();
    }
  }

  async function requestPrint(order: Order) {
    const { error } = await createClient().rpc("request_print", { p_order_id: order.id });
    if (error) {
      setMessage(error.message);
      return;
    }
    const result = await unconfiguredPrintAdapter.printOrder(order);
    setMessage(result.status === "not_configured" ? result.message : "Comanda inviata");
    setSelected(order);
    await load();
  }

  async function markPrinted(order: Order) {
    const { error } = await createClient().rpc("mark_printed", { p_order_id: order.id });
    if (error) setMessage(error.message);
    else {
      setSelected(null);
      await load();
    }
  }
}

function CashierColumn({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
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
        <div><span className="eyebrow">#{order.order_number}</span><h3>Tavolo {order.table?.table_number}</h3></div>
        <time>{formatDateTime(order.sent_to_cashier_at ?? order.created_at)}</time>
      </header>
      <p className="card-meta">{order.cover_count} coperti · {order.waiter?.full_name ?? "Staff"}</p>
      <ul>
        {order.items?.map((item) => (
          <li key={item.id}>
            <strong>{item.quantity}×</strong> {item.item_name_snapshot}
            {item.notes && <small>{item.notes}</small>}
          </li>
        ))}
      </ul>
      {order.general_notes && <p className="card-note"><strong>Nota:</strong> {order.general_notes}</p>}
      <div className="card-total"><span>Totale</span><strong>{formatCurrency(order.total)}</strong></div>
      <div className="card-actions">{actions}</div>
    </article>
  );
}
