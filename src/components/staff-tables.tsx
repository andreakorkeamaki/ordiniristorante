"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/format";
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
  const { markUnreliable } = useConnection();
  const { service, loading: serviceLoading } = useCurrentService();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
    () => new Map(orders.map((order) => [order.table_id, order])),
    [orders],
  );
  const filtered = tables.filter((table) =>
    `${table.table_number} ${table.display_name ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  if (loading || serviceLoading) {
    return <div className="loader" aria-label="Caricamento tavoli" />;
  }

  return (
    <>
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">Sala</p>
          <h1>Tavoli</h1>
          <p>{orders.length} attivi · {tables.length - orders.length} liberi</p>
        </div>
        <label className="compact-search">
          <span>⌕</span>
          <input
            placeholder="Cerca tavolo"
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
    </>
  );
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
