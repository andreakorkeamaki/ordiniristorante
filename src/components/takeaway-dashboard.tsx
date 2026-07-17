"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection } from "@/components/connection-provider";
import { useCurrentService } from "@/hooks/use-current-service";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/format";
import { groupOrderItemsByPreparationArea } from "@/lib/order-items";
import { readFailureState } from "@/lib/reliable-data-state";
import { getPrintJobStatusLabel } from "@/lib/print-job-state";
import {
  formatServiceLabel,
  isPreviousService,
} from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import type { Order, PrintJob, Profile } from "@/types/domain";

type TakeawayOrder = Order & { print_jobs?: PrintJob[] };

export function TakeawayDashboard() {
  const router = useRouter();
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
  } = useCurrentService();
  const [orders, setOrders] = useState<TakeawayOrder[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataState, setDataState] = useState<"loading" | "ready" | "stale" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const loadGeneration = useRef(0);
  const hasSnapshot = useRef(false);
  const canWrite =
    connectionCanWrite && dataState === "ready" && serviceState === "ready";

  const load = useCallback(async () => {
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

    const supabase = createClient();
    const [ordersResult, profilesResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "*, items:order_items(*, extras:order_item_extras(*)), print_jobs(*)",
        )
        .eq("order_type", "takeaway")
        .in("status", [...ACTIVE_ORDER_STATUSES]),
      supabase
        .from("profiles")
        .select("id, full_name, role, active")
        .eq("active", true),
    ]);
    const error = ordersResult.error ?? profilesResult.error;
    if (error) {
      if (!error.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Asporti non aggiornati. I dati precedenti restano visibili.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    if (generation !== loadGeneration.current) return;

    setOrders(
      service
        ? ((ordersResult.data ?? []) as TakeawayOrder[]).filter(
            (order) => order.service_id === service.id,
          )
        : [],
    );
    setProfiles(
      new Map(
        ((profilesResult.data ?? []) as Profile[]).map((profile) => [
          profile.id,
          profile,
        ]),
      ),
    );
    hasSnapshot.current = true;
    setLoadError("");
    setDataState("ready");
    setLoading(false);
  }, [markUnreliable, service, serviceError, serviceLoading, serviceState]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    const channel = supabase
      .channel("takeaway-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_item_extras" },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs" },
        load,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const takeaways = orders
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
  const serviceOperational = Boolean(service && !isPreviousService(service));

  if ((loading || serviceLoading) && dataState === "loading") {
    return <div className="loader" aria-label="Caricamento asporti" />;
  }

  return (
    <>
      {dataState !== "ready" && (
        <section className="connection-action-hint" role="alert">
          <strong>Dati asporti non affidabili.</strong> {loadError}
          <button className="text-button" onClick={() => void load()}>
            Riprova
          </button>
        </section>
      )}
      <section className="workspace-heading">
        <div>
          <p className="eyebrow">Ritiro</p>
          <h1>Asporti ({orders.length})</h1>
          <p>Comande aperte ordinate per stato e ora di ritiro.</p>
        </div>
        <div className="takeaway-toolbar">
          <label className="compact-search">
            <span>⌕</span>
            <input
              placeholder="Cerca asporto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            disabled={!canWrite || !serviceOperational}
            onClick={() => {
              setFormError("");
              setShowForm(true);
            }}
            type="button"
          >
            + Nuovo asporto
          </button>
        </div>
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
              ? "Chiudi il servizio precedente prima di creare nuovi asporti."
              : "Puoi creare e modificare le comande da asporto."
            : "Inizia il servizio dalla Cassa prima di creare un asporto."}
        </span>
      </section>

      {!canWrite && <p className="form-error">{blockReason}</p>}

      <section className="takeaway-section takeaway-page-section">
        <div className="takeaway-grid">
          {takeaways.length ? (
            takeaways.map((order) => {
              const updater = profiles.get(order.updated_by);
              const latestPrintJob = [...(order.print_jobs ?? [])].sort(
                (first, second) =>
                  new Date(second.created_at).getTime() -
                  new Date(first.created_at).getTime(),
              )[0];
              const orderItems = groupOrderItemsByPreparationArea(
                order.items ?? [],
              ).flatMap((department) => department.items);

              return (
                <Link
                  className={`takeaway-card status-${order.status}`}
                  href={`/staff/order/${order.id}`}
                  key={order.id}
                >
                  <div>
                    <span className="eyebrow">
                      Comanda #{order.order_number}
                    </span>
                    <strong>{order.takeaway_name}</strong>
                  </div>
                  <time>
                    {order.takeaway_pickup_at
                      ? `Ritiro ${formatTime(order.takeaway_pickup_at)}`
                      : "Ora da definire"}
                  </time>
                  <span className="status-label">
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  {latestPrintJob && (
                    <span className="takeaway-print-status">
                      Stampa: {getPrintJobStatusLabel(latestPrintJob)}
                    </span>
                  )}
                  {orderItems.length > 0 && (
                    <ul className="takeaway-products">
                      {orderItems.map((item) => (
                        <li key={item.id}>
                          <strong>{item.quantity}×</strong>{" "}
                          {item.item_name_snapshot}
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
            })
          ) : (
            <p className="column-empty">
              {query ? "Nessun asporto trovato" : "Nessun asporto attivo"}
            </p>
          )}
        </div>
      </section>

      {showForm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="takeaway-title"
        >
          <form className="takeaway-modal" onSubmit={createTakeaway}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Nuova comanda</p>
                <h2 id="takeaway-title">Nuovo asporto</h2>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setShowForm(false)}
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
                min={service ? `${service.business_date}T00:00` : undefined}
                max={service ? `${service.business_date}T23:59` : undefined}
                required
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <button className="button button-primary" disabled={creating}>
              {creating ? "Creazione…" : "Crea e apri comanda"}
            </button>
          </form>
        </div>
      )}
    </>
  );

  async function createTakeaway(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !serviceOperational || creating) return;

    const data = new FormData(event.currentTarget);
    const pickupValue = String(data.get("pickup_at"));
    if (!service || !pickupValue.startsWith(`${service.business_date}T`)) {
      setFormError("L’orario di ritiro deve appartenere al servizio di oggi.");
      return;
    }
    setCreating(true);
    setFormError("");

    const { data: order, error } = await createClient().rpc(
      "create_takeaway_order",
      {
        p_customer_name: String(data.get("customer_name")),
        p_pickup_at: new Date(pickupValue).toISOString(),
      },
    );

    if (error) {
      if (!error.code) markUnreliable();
      setFormError(error.message);
      setCreating(false);
      return;
    }

    router.push(`/staff/order/${(order as Order).id}`);
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
