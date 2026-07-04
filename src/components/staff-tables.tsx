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

export function StaffTables({ profile }: { profile: Profile }) {
  const { canWrite, markUnreliable } = useConnection();
  const { service, loading: serviceLoading } = useCurrentService();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [reprintTarget, setReprintTarget] = useState<Order | null>(null);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);
  const [reprintMessage, setReprintMessage] = useState("");

  const load = useCallback(async () => {
    if (serviceLoading) return;
    const supabase = createClient();
    const ordersQuery = supabase
      .from("orders")
      .select("*")
      .eq("order_type", "dine_in")
      .in("status", [...ACTIVE_ORDER_STATUSES]);
    const [tablesResult, ordersResult, profilesResult] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("active", true).order("table_number"),
      ordersQuery,
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
  if (loading || serviceLoading) {
    return <div className="loader" aria-label="Caricamento tavoli" />;
  }

  return (
    <>
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">Sala</p>
          <h1>Tavoli</h1>
          <p>
            {orders.length} tavoli attivi · {tables.length - orders.length} liberi
          </p>
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

      {reprintMessage && (
        <button
          className="external-update table-reprint-message"
          onClick={() => setReprintMessage("")}
          type="button"
        >
          {reprintMessage} · Chiudi
        </button>
      )}

      <section className="tables-grid" aria-label="Elenco tavoli">
        {filtered.map((table) => {
          const order = orderByTable.get(table.id);
          const updater = order ? profiles.get(order.updated_by) : null;
          return (
            <TableCard
              enabled={Boolean(service && !isPreviousService(service))}
              order={order}
              onRequestReprint={setReprintTarget}
              reprintBusy={reprintingOrderId === order?.id}
              reprintDisabled={!canWrite || reprintingOrderId !== null}
              service={service}
              table={table}
              updater={updater}
              key={table.id}
            />
          );
        })}
      </section>

      {reprintTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-reprint-title"
        >
          <div className="takeaway-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Ristampa comanda</p>
                <h2 id="table-reprint-title">
                  Comanda #{reprintTarget.order_number}
                </h2>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setReprintTarget(null)}
              >
                Chiudi
              </button>
            </div>
            <p>
              Conferma solo se serve davvero un’altra copia: la comanda verrà
              inviata nuovamente alla stampante.
            </p>
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setReprintTarget(null)}
              >
                Annulla
              </button>
              <button
                className="button button-primary"
                disabled={!canWrite || reprintingOrderId !== null}
                type="button"
                onClick={() => void reprintOrder(reprintTarget)}
              >
                {reprintingOrderId === reprintTarget.id
                  ? "Ristampa…"
                  : "Conferma ristampa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  async function reprintOrder(order: Order) {
    if (!canWrite || reprintingOrderId) return;

    setReprintingOrderId(order.id);
    setReprintMessage("");
    try {
      const response = await fetch("/api/print-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          type: "reprint",
          actionKey: crypto.randomUUID(),
          reason: `Ristampa richiesta dai tavoli da ${profile.full_name}`,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        idempotent?: boolean;
        outcome?: string;
      };

      if (!response.ok && response.status !== 202) {
        setReprintMessage(
          payload.error ?? "Ristampa non riuscita. Verifica la cassa e la stampante.",
        );
      } else if (
        response.status === 202 ||
        ["accepted_state_pending", "verification_required"].includes(
          payload.outcome ?? "",
        )
      ) {
        setReprintMessage(
          payload.message ??
            payload.error ??
            "Ristampa presa in carico: verifica il foglio prima di riprovare.",
        );
      } else {
        setReprintMessage(
          payload.idempotent
            ? "Ristampa già presa in carico: nessun doppio invio."
            : "Ristampa inviata alla stampante.",
        );
      }
    } catch {
      markUnreliable();
      setReprintMessage(
        "Connessione non affidabile. Verifica la stampante prima di ristampare ancora.",
      );
    } finally {
      setReprintTarget(null);
      setReprintingOrderId(null);
    }
  }
}

function TableCard({
  enabled,
  order,
  onRequestReprint,
  reprintBusy,
  reprintDisabled,
  service,
  table,
  updater,
}: {
  enabled: boolean;
  order: Order | undefined;
  onRequestReprint: (order: Order) => void;
  reprintBusy: boolean;
  reprintDisabled: boolean;
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
        <div className="table-card-link">{content}</div>
      </article>
    );
  }

  const canReprint = order
    ? ["confirmed", "in_preparation", "bill_requested"].includes(order.status)
    : false;

  return (
    <article className={`table-card status-${order?.status ?? "free"}`}>
      <Link className="table-card-link" href={`/staff/table/${table.id}`}>
        {content}
      </Link>
      {order && canReprint && (
        <button
          className="table-card-reprint"
          disabled={reprintDisabled}
          onClick={() => onRequestReprint(order)}
          type="button"
        >
          {reprintBusy ? "Ristampa…" : "Ristampa comanda"}
        </button>
      )}
    </article>
  );
}
