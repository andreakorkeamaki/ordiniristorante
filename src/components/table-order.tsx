"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useConnection } from "@/components/connection-provider";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { QUICK_NOTES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { reportOperationalError } from "@/lib/operational-client-log";
import type { OperationalEvent } from "@/lib/operational-events";
import {
  aggregateMenuItemQuantities,
  getOrderSubmissionIssue,
} from "@/lib/order-calculations";
import { shouldFlagExternalOrderUpdate } from "@/lib/order-realtime";
import {
  canEditOrder,
  canSendOrderUpdate,
} from "@/lib/order-workflow";
import { getOrderShortLabel } from "@/lib/order-display";
import {
  aggregateIdenticalOrderItems,
  applyPendingQuantityDeltas,
  buildQuantityChangeOperations,
} from "@/lib/order-items";
import { formatServiceLabel, isPreviousService } from "@/lib/service-management";
import {
  isRealtimeFailureStatus,
  isRealtimeSubscribedStatus,
} from "@/lib/realtime-status";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  MenuCategory,
  MenuExtra,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  PrintJobType,
  PrintStatus,
  Profile,
  RestaurantTable,
} from "@/types/domain";

type MutationTask = () => Promise<void>;
type QuantityPhase = "idle" | "collecting" | "flushing";

const QUANTITY_BATCH_DELAY_MS = 250;
const MAX_COVER_COUNT = 99;

export function TableOrder({
  tableId,
  orderId: requestedOrderId,
  profile,
}: {
  tableId?: string;
  orderId?: string;
  profile: Profile;
}) {
  const takeawayMode = Boolean(requestedOrderId);
  const {
    status,
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
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [quantityPhase, setQuantityPhase] = useState<QuantityPhase>("idle");
  const [pendingQuantityDeltas, setPendingQuantityDeltas] = useState<
    Record<string, number>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverDraft, setCoverDraft] = useState(0);
  const [presence, setPresence] = useState<string[]>([]);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [updatePrintStatus, setUpdatePrintStatus] = useState<PrintStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const selfUpdate = useRef(false);
  const mutationInFlight = useRef(false);
  const quantityPhaseRef = useRef<QuantityPhase>("idle");
  const pendingQuantityDeltasRef = useRef<Record<string, number>>({});
  const quantityFlushTimer = useRef<number | null>(null);
  const itemsRef = useRef<OrderItem[]>([]);
  const orderPanelRef = useRef<HTMLElement>(null);
  const submittingRef = useRef(false);
  const initialLoadStarted = useRef(false);
  const baseLoaded = useRef(false);
  const loadedSuccessfully = useRef(false);
  const wasBlocked = useRef(false);
  const orderLoadGeneration = useRef(0);
  const baseLoadGeneration = useRef(0);
  const [dataState, setDataState] = useState<"loading" | "ready" | "stale" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const canWrite =
    connectionCanWrite && dataState === "ready" && serviceState === "ready";

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const loadOrder = useCallback(
    async (create = false) => {
      const generation = ++orderLoadGeneration.current;
      const supabase = createClient();
      let currentOrder: Order | null = null;

      if (takeawayMode) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("id", requestedOrderId!)
          .eq("order_type", "takeaway")
          .in("status", ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"])
          .maybeSingle();
        if (error) {
          if (generation !== orderLoadGeneration.current) return;
          setSaving("error");
          setLoadError("Ordine non aggiornato. Le modifiche restano bloccate.");
          setDataState(loadedSuccessfully.current ? "stale" : "error");
          if (isConnectionFailure(error)) markUnreliable();
          setLoading(false);
          return;
        }
        currentOrder = data as Order | null;
      } else if (create && tableId) {
        const { data, error } = await supabase.rpc("get_or_create_active_order", {
          p_table_id: tableId,
        });
        if (error) {
          if (generation !== orderLoadGeneration.current) return;
          setSaving("error");
          setLoadError("Creazione ordine non confermata dal server.");
          setDataState(loadedSuccessfully.current ? "stale" : "error");
          if (isConnectionFailure(error)) markUnreliable();
          setLoading(false);
          return;
        }
        currentOrder = data as Order;
      } else if (tableId) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("table_id", tableId)
          .in("status", ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"])
          .maybeSingle();
        if (error) {
          if (generation !== orderLoadGeneration.current) return;
          setSaving("error");
          setLoadError("Ordine non aggiornato. Le modifiche restano bloccate.");
          setDataState(loadedSuccessfully.current ? "stale" : "error");
          if (isConnectionFailure(error)) markUnreliable();
          setLoading(false);
          return;
        }
        currentOrder = data as Order | null;
      }

      if (!currentOrder) {
        if (generation !== orderLoadGeneration.current) return;
        setOrder(null);
        setItems([]);
        setUpdatePrintStatus(null);
        setLoading(false);
        setLoadError("");
        setDataState("ready");
        return;
      }

      const [linesResult, updateJobResult] = await Promise.all([
        supabase
          .from("order_items")
          .select("*, extras:order_item_extras(*)")
          .eq("order_id", currentOrder.id)
          .order("created_at"),
        supabase
          .from("print_jobs")
          .select("status")
          .eq("order_id", currentOrder.id)
          .eq("job_type", "order_update")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const loadError = linesResult.error ?? updateJobResult.error;
      if (loadError) {
        if (generation !== orderLoadGeneration.current) return;
        setSaving("error");
        setLoadError("Righe ordine non aggiornate. Lo snapshot precedente resta visibile.");
        setDataState(loadedSuccessfully.current ? "stale" : "error");
        if (isConnectionFailure(loadError)) markUnreliable();
        setLoading(false);
        return;
      }
      if (generation !== orderLoadGeneration.current) return;
      setOrder(currentOrder);
      setItems((linesResult.data ?? []) as OrderItem[]);
      setUpdatePrintStatus(
        (updateJobResult.data?.status as PrintStatus | undefined) ?? null,
      );
      if (quantityPhaseRef.current === "idle") setSaving("saved");
      loadedSuccessfully.current = true;
      setLoadError("");
      setDataState("ready");
      setLoading(false);
    },
    [markUnreliable, requestedOrderId, tableId, takeawayMode],
  );
  const scheduleOrderRefresh = useCoalescedRefresh(loadOrder);

  const loadBase = useCallback(async (createOrder: boolean) => {
    const generation = ++baseLoadGeneration.current;
    const supabase = createClient();
    const [tableResult, categoryResult, itemResult, extraResult] = await Promise.all([
      tableId
        ? supabase.from("restaurant_tables").select("*").eq("id", tableId).single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("menu_categories")
        .select("*")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("menu_items")
        .select("*")
        .eq("active", true)
        .eq("visible_staff", true)
        .order("category_id")
        .order("sort_order")
        .order("name"),
      supabase.from("menu_extras").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
    ]);
    const firstError =
      tableResult.error ?? categoryResult.error ?? itemResult.error ?? extraResult.error;
    if (firstError) {
      if (generation !== baseLoadGeneration.current) return;
      if (isConnectionFailure(firstError)) markUnreliable();
      setSaving("error");
      setLoadError("Menu o dati tavolo non disponibili. Riprova.");
      setDataState(baseLoaded.current ? "stale" : "error");
      setLoading(false);
      return;
    }
    if (generation !== baseLoadGeneration.current) return;

    const loadedCategories = (categoryResult.data ?? []) as MenuCategory[];
    setTable((tableResult.data as RestaurantTable | null) ?? null);
    setCategories(loadedCategories);
    setMenuItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setActiveCategory((current) => current || loadedCategories[0]?.id || "");
    await loadOrder(createOrder);
    baseLoaded.current = true;
  }, [loadOrder, markUnreliable, tableId]);

  const mutate = useCallback(
    async (
      event: OperationalEvent,
      task: MutationTask,
      allowQuantityBatch = false,
    ) => {
      const serviceAvailable = Boolean(service && !isPreviousService(service));
      if (!canWrite || !serviceAvailable) {
        setSaving("error");
        setMutationError(
          !canWrite
            ? blockReason ?? "Connessione non verificata. Operazione non eseguita."
            : "Il servizio non è aperto o appartiene a un giorno precedente.",
        );
        return false;
      }
      if (
        mutationInFlight.current ||
        submittingRef.current ||
        (!allowQuantityBatch && quantityPhaseRef.current !== "idle")
      ) {
        setMutationError("Salvataggio già in corso. Attendi un momento e ripeti il comando.");
        return false;
      }

      mutationInFlight.current = true;
      setSaving("saving");
      setMutationError("");
      selfUpdate.current = true;
      try {
        await task();
        await loadOrder();
        return true;
      } catch (error) {
        reportOperationalError({ event, error, orderId: order?.id });
        const connectionFailure = isConnectionFailure(error);
        if (connectionFailure) {
          markUnreliable();
        } else {
          // Domain errors such as optimistic-lock conflicts mean the local
          // order snapshot may be stale. Refresh it before allowing another
          // edit; never retry the mutation automatically.
          await loadOrder();
        }
        setSaving("error");
        setMutationError(
          connectionFailure
            ? getErrorMessage(error)
            : `${getErrorMessage(error)} La comanda è stata ricaricata: verifica i dati prima di ripetere.`,
        );
        return false;
      } finally {
        mutationInFlight.current = false;
        window.setTimeout(() => {
          selfUpdate.current = false;
        }, 500);
      }
    },
    [blockReason, canWrite, loadOrder, markUnreliable, order?.id, service],
  );

  const flushQuantityChanges = useCallback(async () => {
    if (quantityFlushTimer.current !== null) {
      window.clearTimeout(quantityFlushTimer.current);
      quantityFlushTimer.current = null;
    }

    const changes = Object.entries(pendingQuantityDeltasRef.current)
      .filter(([, delta]) => delta !== 0);
    if (changes.length === 0) {
      quantityPhaseRef.current = "idle";
      setQuantityPhase("idle");
      setSaving("saved");
      return;
    }

    quantityPhaseRef.current = "flushing";
    setQuantityPhase("flushing");
    const succeeded = await mutate(
      "order_item_quantity_change_failed",
      async () => {
        const operations = changes.flatMap(([itemId, delta]) =>
          buildQuantityChangeOperations(itemsRef.current, itemId, delta),
        );
        if (operations.length === 0) {
          throw new Error("La riga non è più disponibile.");
        }

        const results = await Promise.all(
          operations.map(({ itemId, delta }) =>
            createClient().rpc("change_order_item_quantity", {
              p_item_id: itemId,
              p_delta: delta,
            }),
          ),
        );
        const firstError = results.find((result) => result.error)?.error;
        if (firstError) throw firstError;
      },
      true,
    );

    pendingQuantityDeltasRef.current = {};
    setPendingQuantityDeltas({});
    quantityPhaseRef.current = "idle";
    setQuantityPhase("idle");
    if (succeeded) setSaving("saved");
  }, [mutate]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (
        document.visibilityState === "hidden" &&
        quantityPhaseRef.current === "collecting"
      ) {
        void flushQuantityChanges();
      }
    };
    document.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (quantityPhaseRef.current === "collecting") {
        void flushQuantityChanges();
      } else if (quantityFlushTimer.current !== null) {
        window.clearTimeout(quantityFlushTimer.current);
        quantityFlushTimer.current = null;
      }
    };
  }, [flushQuantityChanges]);

  useEffect(() => {
    if (
      status === "checking" ||
      serviceLoading ||
      initialLoadStarted.current
    ) {
      return;
    }
    initialLoadStarted.current = true;
    queueMicrotask(() =>
      void loadBase(Boolean(canWrite && service && !isPreviousService(service))),
    );
  }, [canWrite, loadBase, service, serviceLoading, status]);

  useEffect(() => {
    if (
      !initialLoadStarted.current ||
      !baseLoaded.current ||
      !canWrite ||
      !service ||
      isPreviousService(service) ||
      order ||
      takeawayMode
    ) {
      return;
    }
    queueMicrotask(() => void loadOrder(true));
  }, [canWrite, loadOrder, order, service, takeawayMode]);

  useEffect(() => {
    if (status !== "online") {
      wasBlocked.current = true;
      return;
    }
    if (!wasBlocked.current) return;
    wasBlocked.current = false;
    queueMicrotask(() => {
      if (loadedSuccessfully.current) void loadOrder();
      else void loadBase(true);
    });
  }, [loadBase, loadOrder, status]);

  const orderId = order?.id;

  useEffect(() => {
    if (!orderId) return;
    const supabase = createClient();
    let subscribed = false;
    const changes = supabase
      .channel(`order:${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (
            shouldFlagExternalOrderUpdate({
              profileId: profile.id,
              selfUpdate: selfUpdate.current,
              newRow: payload.new,
              oldRow: payload.old,
            })
          ) {
            setExternalUpdate(true);
          }
          scheduleOrderRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${orderId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (
            shouldFlagExternalOrderUpdate({
              profileId: profile.id,
              selfUpdate: selfUpdate.current,
              newRow: payload.new,
              oldRow: payload.old,
            })
          ) {
            setExternalUpdate(true);
          }
          scheduleOrderRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_jobs", filter: `order_id=eq.${orderId}` },
        scheduleOrderRefresh,
      )
      .subscribe((channelStatus: string) => {
        if (isRealtimeFailureStatus(channelStatus)) {
          markUnreliable();
          setSaving("error");
          setLoadError("Aggiornamenti della comanda interrotti. Riconnessione in corso.");
          setDataState(loadedSuccessfully.current ? "stale" : "error");
          return;
        }
        if (isRealtimeSubscribedStatus(channelStatus)) {
          if (subscribed) scheduleOrderRefresh();
          subscribed = true;
        }
      });

    const room = supabase.channel(
      tableId ? `table:${tableId}` : `table:takeaway:${orderId}`,
      {
      config: { presence: { key: profile.id }, private: true },
      },
    );
    room
      .on("presence", { event: "sync" }, () => {
        const names = Object.values(room.presenceState())
          .flat()
          .map((entry) => {
            const payload = entry as { name?: string };
            return String(payload.name ?? "Staff");
          });
        setPresence([...new Set(names)]);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await room.track({ user_id: profile.id, name: profile.full_name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void supabase.removeChannel(changes);
      void supabase.removeChannel(room);
    };
  }, [markUnreliable, orderId, profile.full_name, profile.id, scheduleOrderRefresh, tableId]);

  const visibleProducts = useMemo(() => {
    const needle = search.toLowerCase().trim();
    const takeawayCategoryIds = new Set(
      categories
        .filter((category) => category.slug === "all-you-can-eat")
        .map((category) => category.id),
    );
    return menuItems.filter((item) => {
      if (takeawayMode && takeawayCategoryIds.has(item.category_id)) return false;
      const matchesCategory = search ? true : item.category_id === activeCategory;
      const matchesSearch =
        !needle ||
        `${item.name} ${item.ingredients ?? ""}`.toLowerCase().includes(needle);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, categories, menuItems, search, takeawayMode]);
  const displayedItems = useMemo(
    () => applyPendingQuantityDeltas(items, pendingQuantityDeltas),
    [items, pendingQuantityDeltas],
  );
  const menuItemQuantities = useMemo(
    () => aggregateMenuItemQuantities(displayedItems),
    [displayedItems],
  );
  const displayedProductCount = displayedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  if (serviceState === "error") {
    return (
      <section className="empty-card" role="alert">
        <h1>Stato del servizio non disponibile</h1>
        <p>{serviceError || "Riprova quando la connessione dati è affidabile."}</p>
      </section>
    );
  }
  if (loading || status === "checking" || serviceLoading) {
    return <div className="loader" aria-label="Caricamento comanda" />;
  }
  if (dataState === "error") {
    return (
      <section className="empty-card" role="alert">
        <h1>Dati comanda non disponibili</h1>
        <p>{loadError}</p>
        <button className="button button-primary" onClick={() => void loadBase(false)}>
          Riprova
        </button>
      </section>
    );
  }
  if (!order || (!takeawayMode && !table)) {
    const serviceMessage = !service
      ? "La cassa deve iniziare il servizio prima di aprire il tavolo."
      : isPreviousService(service)
        ? "Il servizio precedente deve essere chiuso dalla cassa prima di creare nuove comande."
        : null;
    return (
      <section className="empty-card">
        <h1>
          {serviceMessage
            ? "Nessun servizio operativo"
            : canWrite
              ? takeawayMode
                ? "Asporto non disponibile"
                : "Tavolo non disponibile"
              : "Comanda non disponibile offline"}
        </h1>
        <p>{serviceMessage ?? (!canWrite ? blockReason : null)}</p>
        <Link
          className="button button-primary"
          href={takeawayMode ? "/asporti" : "/staff/tables"}
        >
          {takeawayMode ? "Torna agli asporti" : "Torna ai tavoli"}
        </Link>
      </section>
    );
  }

  const serviceOperational = Boolean(service && !isPreviousService(service));
  const operationsEnabled = canWrite && serviceOperational;
  const operationalBlockReason = !canWrite
    ? blockReason ??
      serviceError ??
      "Dati non aggiornati. Le modifiche restano bloccate."
    : !service
      ? "Nessun servizio aperto."
      : !serviceOperational
        ? "Il servizio precedente deve essere chiuso dalla cassa."
        : null;
  const editable = canEditOrder(order.status);
  const writeEnabled =
    editable &&
    operationsEnabled &&
    saving !== "saving" &&
    !submitting &&
    quantityPhase === "idle";
  const quantityWriteEnabled =
    editable &&
    operationsEnabled &&
    !submitting &&
    quantityPhase !== "flushing" &&
    (saving !== "saving" || quantityPhase === "collecting");
  const canVerifySubmission =
    profile.role === "waiter" &&
    order.status === "pending_cashier" &&
    isWithinMinutes(order.sent_to_cashier_at, 15);
  const submissionIssue =
    !operationsEnabled && order.status === "draft"
      ? operationalBlockReason
      : getOrderSubmissionIssue({
          status: order.status,
          itemCount: items.length,
          saving,
        });
  const updateReady =
    canSendOrderUpdate(order.status) && updatePrintStatus === "pending";
  const submissionType: Extract<PrintJobType, "new_order" | "order_update"> | null =
    order.status === "draft"
      ? "new_order"
      : updateReady
        ? "order_update"
        : canVerifySubmission
          ? "new_order"
          : null;

  return (
    <>
      {dataState === "stale" && (
        <section className="connection-action-hint" role="alert">
          <strong>Snapshot non aggiornato.</strong> {loadError}
          <button className="text-button" onClick={() => void loadOrder()}>
            Riprova
          </button>
        </section>
      )}
      <section className="order-heading">
        <div>
          <Link
            className="back-link"
            href={order.order_type === "takeaway" ? "/asporti" : "/staff/tables"}
          >
            {order.order_type === "takeaway" ? "← Asporti" : "← Tavoli"}
          </Link>
          <p className="eyebrow">Comanda #{order.order_number}</p>
          <h1>{getOrderShortLabel({ ...order, table: table ?? undefined })}</h1>
          {order.order_type === "takeaway" && order.takeaway_pickup_at && (
            <p className="takeaway-pickup">
              Ritiro alle {new Intl.DateTimeFormat("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(order.takeaway_pickup_at))}
            </p>
          )}
          {service && (
            <p className="service-context">{formatServiceLabel(service)}</p>
          )}
        </div>
        <div className="order-live-status">
          <span className={`save-state save-${saving}`}>
            {!operationsEnabled
              ? "Modifiche bloccate"
              : saving === "saved"
                ? "Salvato"
                : saving === "saving"
                  ? "Salvataggio…"
                  : "Non salvato"}
          </span>
          <span className="status-label">{ORDER_STATUS_LABELS[order.status]}</span>
        </div>
      </section>

      {presence.length > 0 && (
        <p className="presence">
          {order.order_type === "takeaway" ? "Asporto" : "Tavolo"} aperto da {presence.join(", ")}
        </p>
      )}
      {externalUpdate && (
        <button className="external-update" onClick={() => setExternalUpdate(false)}>
          Ordine aggiornato da un altro utente · Chiudi
        </button>
      )}
      {mutationError && (
        <button className="external-update error-update" onClick={() => setMutationError("")}>
          {mutationError} · Chiudi
        </button>
      )}
      {!operationsEnabled && (
        <p className="connection-action-hint" role="status">
          {operationalBlockReason} I comandi di modifica restano disabilitati.
        </p>
      )}

      <div className="order-layout">
        <section className="product-picker">
          {order.order_type === "dine_in" && (
            <div className="covers-row covers-row-menu">
              <span>Coperti</span>
              <button
                type="button"
                className="view-order-button"
                aria-label={`Vai alla comanda, ${displayedProductCount} prodotti`}
                onClick={() => {
                  setCoverPickerOpen(false);
                  orderPanelRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  orderPanelRef.current?.focus({ preventScroll: true });
                }}
              >
                <span aria-hidden="true">↓</span>
                <span className="view-order-label">Vedi ordine</span>
                <strong>{displayedProductCount}</strong>
              </button>
              <div className="covers-control">
                <div className="stepper">
                  <button
                    aria-label="Diminuisci coperti"
                    disabled={!writeEnabled || order.cover_count === 0}
                    onClick={() => {
                      setCoverPickerOpen(false);
                      void saveDetails(order.cover_count - 1);
                    }}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="covers-count-button"
                    aria-label={`Scegli numero di coperti, attualmente ${order.cover_count}`}
                    aria-expanded={coverPickerOpen}
                    disabled={!writeEnabled}
                    onClick={() => {
                      setCoverDraft(order.cover_count);
                      setCoverPickerOpen((open) => !open);
                    }}
                  >
                    {order.cover_count}
                  </button>
                  <button
                    aria-label="Aumenta coperti"
                    disabled={!writeEnabled || order.cover_count === MAX_COVER_COUNT}
                    onClick={() => {
                      setCoverPickerOpen(false);
                      void saveDetails(order.cover_count + 1);
                    }}
                  >
                    +
                  </button>
                </div>
                {coverPickerOpen && (
                  <div
                    className="covers-slider-panel"
                    role="group"
                    aria-label="Seleziona il numero di coperti"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setCoverPickerOpen(false);
                    }}
                  >
                    <div className="covers-slider-heading">
                      <span>Numero di coperti</span>
                      <strong aria-live="polite">{coverDraft}</strong>
                    </div>
                    <input
                      aria-label="Numero di coperti"
                      type="range"
                      min="0"
                      max={MAX_COVER_COUNT}
                      step="1"
                      value={coverDraft}
                      onChange={(event) => setCoverDraft(Number(event.target.value))}
                    />
                    <div className="covers-slider-scale" aria-hidden="true">
                      <span>0</span>
                      <span>{MAX_COVER_COUNT}</span>
                    </div>
                    <div className="covers-slider-actions">
                      <button type="button" onClick={() => setCoverPickerOpen(false)}>
                        Annulla
                      </button>
                      <button
                        type="button"
                        className="button-primary"
                        disabled={!writeEnabled}
                        onClick={() => void confirmCoverSelection()}
                      >
                        Conferma
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <label className="compact-search product-search">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca prodotto" />
          </label>
          {!search && (
            <nav className="category-tabs" aria-label="Categorie prodotti">
              {categories.filter((category) =>
                category.slug !== "extra" &&
                !(takeawayMode && category.slug === "all-you-can-eat")
              ).map((category) => (
                <button
                  className={activeCategory === category.id ? "active" : ""}
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          )}
          <div className="product-grid">
            {visibleProducts.map((item) => (
              <button
                className="product-button"
                disabled={!writeEnabled || !item.available}
                title={!operationsEnabled ? operationalBlockReason ?? undefined : undefined}
                key={item.id}
                onClick={() =>
                  void mutate("order_item_add_failed", async () => {
                    const { error } = await createClient().rpc("add_order_item", {
                      p_order_id: order.id,
                      p_menu_item_id: item.id,
                      p_notes: "",
                    });
                    if (error) throw error;
                  })
                }
              >
                {(menuItemQuantities[item.id] ?? 0) > 0 && (
                  <span
                    className="product-quantity-badge"
                    aria-label={`${menuItemQuantities[item.id]} inseriti`}
                  >
                    {menuItemQuantities[item.id]}
                  </span>
                )}
                <span>{item.name}</span>
                <strong>{item.available ? formatCurrency(item.price) : "Esaurito"}</strong>
                {item.ingredients && <small>{item.ingredients}</small>}
              </button>
            ))}
          </div>
        </section>

        <section
          className="order-panel"
          id="table-order-summary"
          ref={orderPanelRef}
          tabIndex={-1}
        >
          <div className="panel-title">
            <div><p className="eyebrow">Ordine</p><h2>Comanda</h2></div>
            <strong>{displayedProductCount} prodotti</strong>
          </div>

          <div className="order-lines">
            {displayedItems.length === 0 && <p className="empty-line">Tocca un prodotto per iniziare.</p>}
            {displayedItems.map((item) => (
              <article className="order-line" key={item.id}>
                <div className="line-main">
                  <div><strong>{item.item_name_snapshot}</strong><small>{formatCurrency(item.item_price_snapshot)} cad.</small></div>
                  <strong>{formatCurrency(item.line_total + item.extras.reduce((sum, extra) => sum + extra.total, 0))}</strong>
                </div>
                <div className="line-actions">
                  <div className="stepper small">
                    <button disabled={!quantityWriteEnabled} onClick={() => queueQuantity(item, -1)}>−</button>
                    <strong>{item.quantity}</strong>
                    <button disabled={!quantityWriteEnabled} onClick={() => queueQuantity(item, 1)}>+</button>
                  </div>
                  <button className="danger-link" disabled={!writeEnabled} onClick={() => void remove(item.id)}>Rimuovi</button>
                </div>
                <div className="quick-notes">
                  {QUICK_NOTES.map((note) => (
                    <button
                      disabled={!writeEnabled}
                      key={note}
                      onClick={() => void saveItemNote(item, item.notes ? `${item.notes}, ${note}` : note)}
                    >
                      {note}
                    </button>
                  ))}
                </div>
                <input
                  className="line-note"
                  defaultValue={item.notes}
                  maxLength={300}
                  disabled={!writeEnabled}
                  placeholder="Nota sulla riga…"
                  onBlur={(event) => {
                    if (event.target.value !== item.notes) void saveItemNote(item, event.target.value);
                  }}
                />
                {item.extras.map((extra) => (
                  <div className="extra-line" key={extra.id}>
                    <span>↳ {extra.quantity}× {extra.extra_name_snapshot} · {formatCurrency(extra.total)}</span>
                    <button
                      type="button"
                      aria-label={`Rimuovi extra ${extra.extra_name_snapshot}`}
                      disabled={!writeEnabled}
                      onClick={() => void removeExtra(extra.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {editable && extras.length > 0 && (
                  <select
                    className="extra-select"
                    defaultValue=""
                    disabled={!writeEnabled}
                    onChange={(event) => {
                      const extraId = event.target.value;
                      event.target.value = "";
                      if (extraId) void addExtra(item.id, extraId);
                    }}
                  >
                    <option value="">+ Aggiungi extra</option>
                    {extras.filter((extra) => extra.available).map((extra) => (
                      <option value={extra.id} key={extra.id}>{extra.name} · {formatCurrency(extra.price)}</option>
                    ))}
                  </select>
                )}
              </article>
            ))}
          </div>

          <label className="general-note">
            Nota generale
            <textarea
              maxLength={500}
              defaultValue={order.general_notes}
              disabled={!writeEnabled}
              placeholder="Es. portare tutto insieme…"
              onBlur={(event) => {
                if (event.target.value !== order.general_notes) {
                  void saveDetails(order.cover_count, event.target.value);
                }
              }}
            />
          </label>

          <div className="totals">
            <p><span>Subtotale</span><strong>{formatCurrency(order.subtotal)}</strong></p>
            {order.order_type === "dine_in" && (
              <p><span>Coperto ({order.cover_count} × {formatCurrency(order.cover_price_snapshot)})</span><strong>{formatCurrency(order.cover_total)}</strong></p>
            )}
            <p className="grand-total"><span>Totale</span><strong>{formatCurrency(order.total)}</strong></p>
          </div>
        </section>
      </div>

      <div className="order-bottom-bar">
        <div><span>Totale</span><strong>{formatCurrency(order.total)}</strong></div>
        {order.status === "draft" && submissionIssue && (
          <p className="order-send-hint" id="order-send-hint" role="status">
            {submissionIssue}
          </p>
        )}
        <button
          className="button button-primary button-large"
          aria-describedby={submissionIssue ? "order-send-hint" : undefined}
          disabled={
            submitting ||
            saving === "saving" ||
            !operationsEnabled ||
            (order.status === "draft" ? submissionIssue !== null : !submissionType)
          }
          onClick={() => {
            if (submissionType) void submitOrder(submissionType);
          }}
        >
          {submitting
            ? "Invio..."
            : getSubmissionLabel({
                orderStatus: order.status,
                updatePrintStatus,
                canVerifySubmission,
              })}
        </button>
      </div>
    </>
  );

  async function confirmCoverSelection() {
    if (coverDraft === order!.cover_count) {
      setCoverPickerOpen(false);
      return;
    }
    const saved = await saveDetails(coverDraft);
    if (saved) setCoverPickerOpen(false);
  }

  async function saveDetails(covers: number, notes = order!.general_notes) {
    if (notes.length > 500) {
      setMutationError("La nota ordine non può superare 500 caratteri.");
      return false;
    }
    return mutate("order_details_update_failed", async () => {
      const { error } = await createClient().rpc("set_order_details", {
        p_order_id: order!.id,
        p_cover_count: covers,
        p_general_notes: notes,
        p_expected_version: order!.version,
      });
      if (error) throw error;
    });
  }

  function queueQuantity(item: OrderItem, delta: number) {
    if (
      !operationsEnabled ||
      !editable ||
      submittingRef.current ||
      mutationInFlight.current ||
      quantityPhaseRef.current === "flushing"
    ) {
      setMutationError("Salvataggio già in corso. Attendi un momento e ripeti il comando.");
      return;
    }
    const nextPending = { ...pendingQuantityDeltasRef.current };
    const nextDelta = (nextPending[item.id] ?? 0) + delta;
    const baseQuantity =
      aggregateIdenticalOrderItems(itemsRef.current)
        .find((currentItem) => currentItem.id === item.id)?.quantity ?? 0;
    if (baseQuantity + nextDelta < 0) return;

    if (nextDelta === 0) delete nextPending[item.id];
    else nextPending[item.id] = nextDelta;
    pendingQuantityDeltasRef.current = nextPending;
    setPendingQuantityDeltas(nextPending);
    setMutationError("");

    if (quantityFlushTimer.current !== null) {
      window.clearTimeout(quantityFlushTimer.current);
      quantityFlushTimer.current = null;
    }
    if (Object.keys(nextPending).length === 0) {
      quantityPhaseRef.current = "idle";
      setQuantityPhase("idle");
      setSaving("saved");
      return;
    }

    quantityPhaseRef.current = "collecting";
    setQuantityPhase("collecting");
    setSaving("saving");
    quantityFlushTimer.current = window.setTimeout(() => {
      quantityFlushTimer.current = null;
      void flushQuantityChanges();
    }, QUANTITY_BATCH_DELAY_MS);
  }

  async function remove(itemId: string) {
    await mutate("order_item_remove_failed", async () => {
      const { error } = await createClient().rpc("remove_order_item", { p_item_id: itemId });
      if (error) throw error;
    });
  }

  async function saveItemNote(item: OrderItem, notes: string) {
    if (notes.length > 300) {
      setMutationError("La nota riga non può superare 300 caratteri.");
      return;
    }
    await mutate("order_item_note_update_failed", async () => {
      const { error } = await createClient().rpc("set_order_item_notes", {
        p_item_id: item.id,
        p_notes: notes,
        p_expected_version: item.version,
      });
      if (error) throw error;
    });
  }

  async function addExtra(itemId: string, extraId: string) {
    await mutate("order_item_extra_add_failed", async () => {
      const { error } = await createClient().rpc("add_order_item_extra", {
        p_item_id: itemId,
        p_menu_extra_id: extraId,
      });
      if (error) throw error;
    });
  }

  async function removeExtra(extraId: string) {
    await mutate("order_item_extra_remove_failed", async () => {
      const { error } = await createClient().rpc("remove_order_item_extra", {
        p_extra_id: extraId,
      });
      if (error) throw error;
    });
  }

  async function submitOrder(
    type: Extract<PrintJobType, "new_order" | "order_update">,
  ) {
    if (submittingRef.current) return;
    if (
      mutationInFlight.current ||
      quantityPhaseRef.current !== "idle"
    ) {
      setMutationError("Attendi il salvataggio in corso prima di inviare la comanda.");
      return;
    }
    if (!operationsEnabled) {
      setSaving("error");
      setMutationError(
        operationalBlockReason ?? "Comanda non inviata.",
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSaving("saving");
    setMutationError("");
    selfUpdate.current = true;

    try {
      const response = await fetch("/api/print-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order!.id, type }),
      });
      const payload = (await response.json()) as {
        error?: string;
        orderAccepted?: boolean;
        outcome?: "failed" | "uncertain";
      };

      if (!response.ok && !payload.orderAccepted) {
        reportOperationalError({
          event: "order_submit_failed",
          error: {
            code: `HTTP_${response.status}`,
            message: payload.error ?? "Invio comanda non riuscito",
          },
          orderId: order!.id,
        });
        setSaving("error");
        setMutationError(
          payload.error ??
            (type === "order_update"
              ? "Invio dell'aggiornamento non riuscito"
              : "Invio della comanda non riuscito"),
        );
        return;
      }

      await loadOrder();
      if (!response.ok) {
        const acceptedLabel =
          type === "order_update"
            ? "Aggiornamento registrato"
            : "Comanda arrivata in cassa";
        setMutationError(
          payload.outcome === "uncertain"
            ? `${acceptedLabel}. Esito stampa incerto: la cassa deve verificare la stampante.`
            : `${acceptedLabel}, ma la stampa è fallita: ${payload.error ?? "interviene la cassa"}.`,
        );
      }
    } catch (error) {
      reportOperationalError({
        event: "order_submit_failed",
        error,
        orderId: order!.id,
      });
      setSaving("error");
      markUnreliable();
      setMutationError(
        "Connessione non affidabile. Non è possibile confermare l'invio: non chiudere o ricaricare.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      window.setTimeout(() => {
        selfUpdate.current = false;
      }, 500);
    }
  }
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Operazione non riuscita.";
}

function isConnectionFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  if (typeof error !== "object" || error === null) return true;

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = getErrorMessage(error).toLowerCase();
  return (
    !code &&
    (message.includes("fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      message.includes("raggiung"))
  );
}

function getSubmissionLabel({
  orderStatus,
  updatePrintStatus,
  canVerifySubmission,
}: {
  orderStatus: OrderStatus;
  updatePrintStatus: PrintStatus | null;
  canVerifySubmission: boolean;
}) {
  if (orderStatus === "draft") return "Invia alla cassa";
  if (updatePrintStatus === "pending") return "Invia aggiornamento";
  if (updatePrintStatus === "printing") return "Aggiornamento in stampa";
  if (updatePrintStatus === "failed") return "Stampa da verificare in cassa";
  if (canVerifySubmission) return "Verifica invio e stampa";
  return "Comanda aggiornata";
}

function isWithinMinutes(value: string | null, minutes: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= minutes * 60_000;
}
