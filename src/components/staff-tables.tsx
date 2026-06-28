"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Order, Profile, RestaurantTable } from "@/types/domain";

export function StaffTables() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [tablesResult, ordersResult, profilesResult] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("active", true).order("table_number"),
      supabase.from("orders").select("*").in("status", [...ACTIVE_ORDER_STATUSES]),
      supabase.from("profiles").select("id, full_name, role, active").eq("active", true),
    ]);

    setTables((tablesResult.data ?? []) as RestaurantTable[]);
    setOrders((ordersResult.data ?? []) as Order[]);
    setProfiles(
      new Map(
        ((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]),
      ),
    );
    setLoading(false);
  }, []);

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

  if (loading) return <div className="loader" aria-label="Caricamento tavoli" />;

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

      <section className="tables-grid" aria-label="Elenco tavoli">
        {filtered.map((table) => {
          const order = orderByTable.get(table.id);
          const updater = order ? profiles.get(order.updated_by) : null;
          return (
            <Link
              className={`table-card status-${order?.status ?? "free"}`}
              href={`/staff/table/${table.id}`}
              key={table.id}
            >
              <div className="table-card-top">
                <span className="table-number">Tavolo {table.table_number}</span>
                <span className="status-dot" />
              </div>
              <strong>{order ? formatCurrency(order.total) : "Libero"}</strong>
              <p>{order ? `${order.cover_count} coperti` : table.display_name ?? "Nessun ordine"}</p>
              <span className="status-label">
                {order ? ORDER_STATUS_LABELS[order.status] : "Libero"}
              </span>
              {order && (
                <small>
                  {formatDateTime(order.updated_at)}
                  {updater ? ` · ${updater.full_name}` : ""}
                </small>
              )}
            </Link>
          );
        })}
      </section>
    </>
  );
}
