"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { readFailureState } from "@/lib/reliable-data-state";
import {
  isRealtimeFailureStatus,
  isRealtimeSubscribedStatus,
} from "@/lib/realtime-status";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import { sortTablesByActivity } from "@/lib/table-ordering";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  Order,
  Profile,
  RestaurantService,
  RestaurantTable,
} from "@/types/domain";

export function StaffTables({ profile }: { profile: Profile }) {
  const { canWrite: connectionCanWrite, markUnreliable } = useConnection();
  const {
    service,
    loading: serviceLoading,
    error: serviceError,
    state: serviceState,
  } = useCurrentService();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [sortActiveTablesFirst, setSortActiveTablesFirst] = useState(true);
  const [tableStatusFilter, setTableStatusFilter] = useState<"all" | "occupied" | "free">("all");
  const [tableSort, setTableSort] = useState<"activity" | "number">("activity");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [reprintTarget, setReprintTarget] = useState<Order | null>(null);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);
  const [reprintMessage, setReprintMessage] = useState("");
  const [dataState, setDataState] = useState<"loading" | "ready" | "stale" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const loadGeneration = useRef(0);
  const hasSnapshot = useRef(false);
  const staticData = useRef<{
    tables: RestaurantTable[] | null;
    profiles: Profile[] | null;
  }>({ tables: null, profiles: null });
  const tableSortInitialized = useRef(false);
  const staticRevision = useRef(0);
  const loadInFlight = useRef<Promise<void> | null>(null);
  const loadRequestedWhileInFlight = useRef(false);
  const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const canWrite =
    connectionCanWrite && dataState === "ready" && serviceState === "ready";

  const performLoad = useCallback(async () => {
    if (serviceLoading) return;
    if (serviceState !== "ready") {
      setLoadError(
        serviceError || "Stato del servizio non disponibile. Riprova.",
      );
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    const generation = ++loadGeneration.current;
    const referenceRevision = staticRevision.current;
    const supabase = createClient();
    const ordersQuery = supabase
      .from("orders")
      .select("*")
      .eq("order_type", "dine_in")
      .in("status", [...ACTIVE_ORDER_STATUSES]);
    const [tablesResult, ordersResult, profilesResult, settingsResult] = await Promise.all([
      staticData.current.tables
        ? Promise.resolve({ data: staticData.current.tables, error: null })
        : supabase.from("restaurant_tables").select("*").eq("active", true).order("table_number"),
      ordersQuery,
      staticData.current.profiles
        ? Promise.resolve({ data: staticData.current.profiles, error: null })
        : supabase.from("profiles").select("id, full_name, role, active").eq("active", true),
      supabase
        .from("restaurant_settings")
        .select("sort_active_tables_first")
        .single(),
    ]);
    const error =
      tablesResult.error ??
      ordersResult.error ??
      profilesResult.error ??
      settingsResult.error;
    if (error) {
      if (!error.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Tavoli non aggiornati. Lo snapshot precedente resta visibile.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    if (generation !== loadGeneration.current) return;

    const loadedTables = (tablesResult.data ?? []) as RestaurantTable[];
    const loadedProfiles = (profilesResult.data ?? []) as Profile[];
    if (referenceRevision === staticRevision.current) {
      staticData.current.tables = loadedTables;
      staticData.current.profiles = loadedProfiles;
    }
    setTables(loadedTables);
    setOrders(
      service
        ? ((ordersResult.data ?? []) as Order[]).filter(
            (order) => order.service_id === service.id,
          )
        : [],
    );
    setProfiles(
      new Map(
        loadedProfiles.map((profile) => [profile.id, profile]),
      ),
    );
    setSortActiveTablesFirst(
      (settingsResult.data as { sort_active_tables_first: boolean })
        .sort_active_tables_first,
    );
    if (!tableSortInitialized.current) {
      tableSortInitialized.current = true;
      setTableSort(
        (settingsResult.data as { sort_active_tables_first: boolean })
          .sort_active_tables_first
          ? "activity"
          : "number",
      );
    }
    hasSnapshot.current = true;
    setLoadError("");
    setDataState("ready");
    setLoading(false);
  }, [markUnreliable, service, serviceError, serviceLoading, serviceState]);
  const load = useCallback(async () => {
    if (loadInFlight.current) {
      loadRequestedWhileInFlight.current = true;
      await loadInFlight.current;
      return;
    }
    const request = performLoad();
    loadInFlight.current = request;
    try {
      await request;
    } finally {
      loadInFlight.current = null;
      if (loadRequestedWhileInFlight.current) {
        loadRequestedWhileInFlight.current = false;
        void loadRef.current();
      }
    }
  }, [performLoad]);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const scheduleLoad = useCoalescedRefresh(load);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    let subscribed = false;
    const channel = supabase
      .channel("staff-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () => {
        staticRevision.current += 1;
        staticData.current.tables = null;
        scheduleLoad();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        staticRevision.current += 1;
        staticData.current.profiles = null;
        scheduleLoad();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_settings" }, scheduleLoad)
      .subscribe((channelStatus: string) => {
        if (isRealtimeFailureStatus(channelStatus)) {
          markUnreliable();
          setLoadError("Aggiornamenti tavoli interrotti. Riconnessione in corso.");
          setDataState(readFailureState(hasSnapshot.current));
          return;
        }
        if (isRealtimeSubscribedStatus(channelStatus)) {
          if (subscribed) {
            staticRevision.current += 1;
            staticData.current = { tables: null, profiles: null };
            scheduleLoad();
          }
          subscribed = true;
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, markUnreliable, scheduleLoad]);

  const orderByTable = useMemo(
    () => new Map(
      orders
        .filter((order) => order.order_type === "dine_in" && order.table_id)
        .map((order) => [order.table_id!, order]),
    ),
    [orders],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTables = useMemo(
    () => tables.filter((table) => {
      const order = orderByTable.get(table.id);
      const matchesQuery = `${table.table_number} ${table.display_name ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesStatus =
        tableStatusFilter === "all" ||
        (tableStatusFilter === "occupied" ? Boolean(order) : !order);
      return matchesQuery && matchesStatus;
    }),
    [normalizedQuery, orderByTable, tableStatusFilter, tables],
  );
  const visibleTables = useMemo(() => {
    if (tableSort === "number") {
      return [...filteredTables].sort((left, right) => left.table_number - right.table_number);
    }
    return sortTablesByActivity(filteredTables, new Set(orderByTable.keys()), sortActiveTablesFirst);
  }, [filteredTables, orderByTable, sortActiveTablesFirst, tableSort]);
  const occupiedCount = tables.filter((table) => orderByTable.has(table.id)).length;
  const hasTableFilters = Boolean(normalizedQuery) || tableStatusFilter !== "all";
  if ((loading || serviceLoading) && dataState === "loading") {
    return <div className="loader" aria-label="Caricamento tavoli" />;
  }

  return (
    <>
      {dataState !== "ready" && (
        <section className="connection-action-hint" role="alert">
          <strong>Dati tavoli non affidabili.</strong> {loadError}
          <button className="text-button" onClick={() => void load()}>
            Riprova
          </button>
        </section>
      )}
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

      <section className="operational-toolbar table-toolbar" aria-label="Filtri tavoli">
        <div className="quick-filter-group" role="group" aria-label="Stato tavoli">
          {([
            ["all", `Tutti (${tables.length})`],
            ["occupied", `Occupati (${occupiedCount})`],
            ["free", `Liberi (${tables.length - occupiedCount})`],
          ] as const).map(([value, label]) => (
            <button
              className={`quick-filter ${tableStatusFilter === value ? "is-active" : ""}`}
              key={value}
              onClick={() => setTableStatusFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sort-control">
          <span>Ordina</span>
          <select value={tableSort} onChange={(event) => setTableSort(event.target.value as "activity" | "number")}>
            <option value="activity">Attivi prima</option>
            <option value="number">Numero tavolo</option>
          </select>
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
            : "La cassa deve iniziare il servizio prima di aprire i tavoli."}
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
        {visibleTables.map((table) => {
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

      {visibleTables.length === 0 && tables.length > 0 && (
        <div className="empty-state">
          <strong>Nessun tavolo corrisponde ai filtri</strong>
          <p>Prova a cambiare stato o a cancellare la ricerca.</p>
          {(hasTableFilters) && (
            <button
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setTableStatusFilter("all");
              }}
              type="button"
            >
              Azzera filtri
            </button>
          )}
        </div>
      )}

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
    <article
      className={`table-card status-${order?.status ?? "free"}${order ? " is-active" : ""}`}
    >
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
