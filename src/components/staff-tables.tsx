"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection } from "@/components/connection-provider";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  Order,
  Profile,
  RestaurantService,
  RestaurantTable,
} from "@/types/domain";

export function StaffTables() {
  const router = useRouter();
  const { canWrite, blockReason, markUnreliable } = useConnection();
  const { service, loading: serviceLoading } = useCurrentService();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showTakeawayForm, setShowTakeawayForm] = useState(false);
  const [creatingTakeaway, setCreatingTakeaway] = useState(false);
  const [takeawayError, setTakeawayError] = useState("");

  const load = useCallback(async () => {
    if (serviceLoading) return;
    const supabase = createClient();
    const [tablesResult, ordersResult, profilesResult] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("active", true).order("table_number"),
      supabase.from("orders").select("*").in("status", [...ACTIVE_ORDER_STATUSES]),
      supabase.from("profiles").select("id, full_name, role, active").eq("active", true),
    ]);
    const error = tablesResult.error ?? ordersResult.error ?? profilesResult.error;
    if (error) {
      if (!error.code) markUnreliable();
      setLoading(false);
      return;
    }

    setTables((tablesResult.data ?? []) as RestaurantTable[]);
    setOrders(
      service
        ? ((ordersResult.data ?? []) as Order[]).filter(
            (order) => order.service_id === service.id,
          )
        : [],
    );
    setProfiles(
      new Map(
        ((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]),
      ),
    );
    setLoading(false);
  }, [markUnreliable, service, serviceLoading]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    const channel = supabase
      .channel("staff-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, load)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const orderByTable = useMemo(
    () => new Map(
      orders
        .filter((order) => order.order_type === "dine_in" && order.table_id)
        .map((order) => [order.table_id!, order]),
    ),
    [orders],
  );
  const filtered = tables.filter((table) =>
    `${table.table_number} ${table.display_name ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const takeaways = orders
    .filter((order) => order.order_type === "takeaway")
    .filter((order) =>
      `${order.takeaway_name ?? ""} ${order.order_number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((first, second) =>
      new Date(first.takeaway_pickup_at ?? first.created_at).getTime() -
      new Date(second.takeaway_pickup_at ?? second.created_at).getTime(),
    );
  const dineInOrders = orders.filter((order) => order.order_type === "dine_in");
  const serviceOperational = Boolean(service && !isPreviousService(service));

  if (loading || serviceLoading) {
    return <div className="loader" aria-label="Caricamento tavoli" />;
  }

  return (
    <>
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">Sala</p>
          <h1>Tavoli e asporti</h1>
          <p>
            {dineInOrders.length} tavoli attivi · {takeaways.length} asporti ·{" "}
            {tables.length - dineInOrders.length} liberi
          </p>
        </div>
        <label className="compact-search">
          <span>⌕</span>
          <input
            placeholder="Cerca tavolo o asporto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      <section
        className={`staff-service-status ${service ? "is-open" : "is-closed"} ${
          service && isPreviousService(service) ? "is-previous" : ""
        }`}
        role="status"
      >
        <strong>
          {service ? formatServiceLabel(service) : "Nessun servizio aperto"}
        </strong>
        <span>
          {service
            ? isPreviousService(service)
              ? "La cassa deve chiudere questo servizio precedente."
              : "Puoi aprire e modificare le comande."
            : "La cassa deve iniziare pranzo o cena prima di aprire i tavoli."}
        </span>
      </section>

      <section className="takeaway-section">
        <div className="takeaway-section-heading">
          <div>
            <p className="eyebrow">Ritiro</p>
            <h2>Asporti</h2>
          </div>
          <button
            className="button button-primary"
            disabled={!canWrite || !serviceOperational}
            onClick={() => {
              setTakeawayError("");
              setShowTakeawayForm(true);
            }}
          >
            + Nuovo asporto
          </button>
        </div>
        {!canWrite && <p className="form-error">{blockReason}</p>}
        <div className="takeaway-grid">
          {takeaways.length ? takeaways.map((order) => {
            const updater = profiles.get(order.updated_by);
            return (
              <Link
                className={`takeaway-card status-${order.status}`}
                href={`/staff/order/${order.id}`}
                key={order.id}
              >
                <div>
                  <span className="eyebrow">Comanda #{order.order_number}</span>
                  <strong>{order.takeaway_name}</strong>
                </div>
                <time>
                  {order.takeaway_pickup_at
                    ? `Ritiro ${formatTime(order.takeaway_pickup_at)}`
                    : "Ora da definire"}
                </time>
                <span className="status-label">{ORDER_STATUS_LABELS[order.status]}</span>
                <b>{formatCurrency(order.total)}</b>
                <small>
                  Aggiornato {formatDateTime(order.updated_at)}
                  {updater ? ` · ${updater.full_name}` : ""}
                </small>
              </Link>
            );
          }) : (
            <p className="column-empty">Nessun asporto attivo</p>
          )}
        </div>
      </section>

      <section className="tables-grid" aria-label="Elenco tavoli">
        {filtered.map((table) => {
          const order = orderByTable.get(table.id);
          const updater = order ? profiles.get(order.updated_by) : null;
          return (
            <TableCard
              enabled={Boolean(service && !isPreviousService(service))}
              order={order}
              service={service}
              table={table}
              updater={updater}
              key={table.id}
            />
          );
        })}
      </section>

      {showTakeawayForm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="takeaway-title">
          <form className="takeaway-modal" onSubmit={createTakeaway}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Nuova comanda</p>
                <h2 id="takeaway-title">Nuovo asporto</h2>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setShowTakeawayForm(false)}
              >
                Chiudi
              </button>
            </div>
            <label>
              Nome cliente
              <input name="customer_name" maxLength={80} autoFocus required />
            </label>
            <label>
              Ora di ritiro
              <input
                name="pickup_at"
                type="datetime-local"
                defaultValue={getCurrentLocalDateTime()}
                required
              />
            </label>
            {takeawayError && <p className="form-error">{takeawayError}</p>}
            <button className="button button-primary" disabled={creatingTakeaway}>
              {creatingTakeaway ? "Creazione…" : "Crea e apri comanda"}
            </button>
          </form>
        </div>
      )}
    </>
  );

  async function createTakeaway(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !serviceOperational || creatingTakeaway) return;

    const data = new FormData(event.currentTarget);
    const pickupValue = String(data.get("pickup_at"));
    setCreatingTakeaway(true);
    setTakeawayError("");

    const { data: order, error } = await createClient().rpc("create_takeaway_order", {
      p_customer_name: String(data.get("customer_name")),
      p_pickup_at: new Date(pickupValue).toISOString(),
    });

    if (error) {
      if (!error.code) markUnreliable();
      setTakeawayError(error.message);
      setCreatingTakeaway(false);
      return;
    }

    const created = order as Order;
    router.push(`/staff/order/${created.id}`);
  }
}

function getCurrentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function TableCard({
  enabled,
  order,
  service,
  table,
  updater,
}: {
  enabled: boolean;
  order: Order | undefined;
  service: RestaurantService | null;
  table: RestaurantTable;
  updater: Profile | null | undefined;
}) {
  const content = (
    <>
      <div className="table-card-top">
        <span className="table-number">Tavolo {table.table_number}</span>
        <span className="status-dot" />
      </div>
      <strong>{order ? formatCurrency(order.total) : "Libero"}</strong>
      <p>
        {order
          ? `${order.cover_count} coperti`
          : table.display_name ?? "Nessun ordine"}
      </p>
      <span className="status-label">
        {order
          ? ORDER_STATUS_LABELS[order.status]
          : service
            ? "Libero"
            : "Servizio chiuso"}
      </span>
      {order && (
        <small>
          {formatDateTime(order.updated_at)}
          {updater ? ` · ${updater.full_name}` : ""}
        </small>
      )}
    </>
  );

  if (!enabled) {
    return (
      <article className="table-card status-free is-disabled">
        {content}
      </article>
    );
  }

  return (
    <Link
      className={`table-card status-${order?.status ?? "free"}`}
      href={`/staff/table/${table.id}`}
    >
      {content}
    </Link>
  );
}
