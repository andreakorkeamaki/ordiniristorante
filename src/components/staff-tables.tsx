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
import {
  groupOrderItemsByPreparationArea,
} from "@/lib/order-items";
import { getPrintJobStatusLabel } from "@/lib/print-job-state";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  Order,
  PrintJob,
  Profile,
  RestaurantService,
  RestaurantTable,
} from "@/types/domain";

type StaffOrder = Order & { print_jobs?: PrintJob[] };

export function StaffTables({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { canWrite, blockReason, markUnreliable } = useConnection();
  const { service, loading: serviceLoading } = useCurrentService();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showTakeawayForm, setShowTakeawayForm] = useState(false);
  const [creatingTakeaway, setCreatingTakeaway] = useState(false);
  const [takeawayError, setTakeawayError] = useState("");
  const [takeawaysOpen, setTakeawaysOpen] = useState(true);
  const [reprintTarget, setReprintTarget] = useState<Order | null>(null);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);
  const [reprintMessage, setReprintMessage] = useState("");

  const load = useCallback(async () => {
    if (serviceLoading) return;
    const supabase = createClient();
    const ordersQuery = supabase
      .from("orders")
      .select(
        "*, items:order_items(*, extras:order_item_extras(*)), print_jobs(*)",
      )
      .in("status", [...ACTIVE_ORDER_STATUSES]);
    if (profile.role === "waiter") {
      ordersQuery.eq("order_type", "dine_in");
    }
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
        ? ((ordersResult.data ?? []) as StaffOrder[]).filter(
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
  }, [markUnreliable, profile.role, service, serviceLoading]);

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
  const canManageTakeaways = ["cashier", "admin"].includes(profile.role);
  const takeaways = orders
    .filter((order) => order.order_type === "takeaway")
    .filter((order) =>
      `${order.takeaway_name ?? ""} ${order.order_number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((first, second) => {
      const statusDifference =
        takeawayStatusPriority(first) - takeawayStatusPriority(second);
      if (statusDifference) return statusDifference;
      return (
        new Date(first.takeaway_pickup_at ?? first.created_at).getTime() -
        new Date(second.takeaway_pickup_at ?? second.created_at).getTime()
      );
    });
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
          <h1>{canManageTakeaways ? "Tavoli e asporti" : "Tavoli"}</h1>
          <p>
            {dineInOrders.length} tavoli attivi
            {canManageTakeaways ? ` · ${takeaways.length} asporti` : ""} ·{" "}
            {tables.length - dineInOrders.length} liberi
          </p>
        </div>
        <label className="compact-search">
          <span>⌕</span>
          <input
            placeholder={canManageTakeaways ? "Cerca tavolo o asporto" : "Cerca tavolo"}
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

      {canManageTakeaways && <section className="takeaway-section">
        <div className="takeaway-section-heading">
          <button
            aria-expanded={takeawaysOpen}
            className="takeaway-collapse"
            onClick={() => setTakeawaysOpen((current) => !current)}
            type="button"
          >
            <p className="eyebrow">Ritiro</p>
            <h2>Asporti ({takeaways.length})</h2>
            <span aria-hidden="true">{takeawaysOpen ? "−" : "+"}</span>
          </button>
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
        {takeawaysOpen && <div className="takeaway-grid">
          {takeaways.length ? takeaways.map((order) => {
            const updater = profiles.get(order.updated_by);
            const latestPrintJob = [...(order.print_jobs ?? [])].sort(
              (first, second) =>
                new Date(second.created_at).getTime() -
                new Date(first.created_at).getTime(),
            )[0];
            const orderItems = groupOrderItemsByPreparationArea(order.items ?? [])
              .flatMap((department) => department.items);
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
                {latestPrintJob && (
                  <span className="takeaway-print-status">
                    Stampa: {getPrintJobStatusLabel(latestPrintJob)}
                  </span>
                )}
                {orderItems.length > 0 && (
                  <ul className="takeaway-products">
                    {orderItems.map((item) => (
                      <li key={item.id}>
                        <strong>{item.quantity}×</strong> {item.item_name_snapshot}
                        {item.notes && <small>{item.notes}</small>}
                      </li>
                    ))}
                  </ul>
                )}
                {order.general_notes && (
                  <p className="takeaway-note">
                    <strong>Nota:</strong> {order.general_notes}
                  </p>
                )}
                <small>
                  Aggiornato {formatDateTime(order.updated_at)}
                  {updater ? ` · ${updater.full_name}` : ""}
                </small>
              </Link>
            );
          }) : (
            <p className="column-empty">Nessun asporto attivo</p>
          )}
        </div>}
      </section>}

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

function getCurrentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function takeawayStatusPriority(order: Order) {
  return {
    draft: 0,
    pending_cashier: 1,
    confirmed: 2,
    in_preparation: 3,
    bill_requested: 4,
    closed: 5,
    cancelled: 6,
  }[order.status];
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
