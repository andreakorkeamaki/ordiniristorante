"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { QUICK_NOTES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import {
  getOrderSubmissionIssue,
  validateAllYouCanEat,
} from "@/lib/order-calculations";
import { formatServiceLabel, isPreviousService } from "@/lib/service-management";
import { createClient } from "@/lib/supabase/client";
import { useCurrentService } from "@/hooks/use-current-service";
import type {
  MenuCategory,
  MenuExtra,
  MenuItem,
  Order,
  OrderItem,
  Profile,
  RestaurantTable,
} from "@/types/domain";

type MutationTask = () => Promise<void>;

export function TableOrder({ tableId, profile }: { tableId: string; profile: Profile }) {
  const { status, canWrite, blockReason, markUnreliable } = useConnection();
  const { service, loading: serviceLoading } = useCurrentService();
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<"saved" | "saving" | "error">("saved");
  const [mutationError, setMutationError] = useState("");
  const [presence, setPresence] = useState<string[]>([]);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const selfUpdate = useRef(false);
  const initialLoadStarted = useRef(false);
  const baseLoaded = useRef(false);
  const loadedSuccessfully = useRef(false);
  const wasBlocked = useRef(false);

  const loadOrder = useCallback(
    async (create = false) => {
      const supabase = createClient();
      let currentOrder: Order | null = null;

      if (create) {
        const { data, error } = await supabase.rpc("get_or_create_active_order", {
          p_table_id: tableId,
        });
        if (error) {
          setSaving("error");
          if (isConnectionFailure(error)) markUnreliable();
          setLoading(false);
          return;
        }
        currentOrder = data as Order;
      } else {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("table_id", tableId)
          .in("status", ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"])
          .maybeSingle();
        if (error) {
          setSaving("error");
          if (isConnectionFailure(error)) markUnreliable();
          setLoading(false);
          return;
        }
        currentOrder = data as Order | null;
      }

      if (!currentOrder) {
        setOrder(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: lines, error: linesError } = await supabase
        .from("order_items")
        .select("*, extras:order_item_extras(*)")
        .eq("order_id", currentOrder.id)
        .order("created_at");
      if (linesError) {
        setSaving("error");
        if (isConnectionFailure(linesError)) markUnreliable();
        setLoading(false);
        return;
      }
      setOrder(currentOrder);
      setItems((lines ?? []) as OrderItem[]);
      setSaving("saved");
      loadedSuccessfully.current = true;
      setLoading(false);
    },
    [markUnreliable, tableId],
  );

  const loadBase = useCallback(async (createOrder: boolean) => {
    const supabase = createClient();
    const [tableResult, categoryResult, itemResult, extraResult] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("id", tableId).single(),
      supabase.from("menu_categories").select("*").eq("active", true).order("sort_order"),
      supabase.from("menu_items").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
      supabase.from("menu_extras").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
    ]);
    const firstError =
      tableResult.error ?? categoryResult.error ?? itemResult.error ?? extraResult.error;
    if (firstError) {
      if (isConnectionFailure(firstError)) markUnreliable();
      setSaving("error");
      setLoading(false);
      return;
    }

    const loadedCategories = (categoryResult.data ?? []) as MenuCategory[];
    setTable(tableResult.data as RestaurantTable);
    setCategories(loadedCategories);
    setMenuItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setActiveCategory((current) => current || loadedCategories[0]?.id || "");
    await loadOrder(createOrder);
    baseLoaded.current = true;
  }, [loadOrder, markUnreliable, tableId]);

  const mutate = useCallback(
    async (task: MutationTask) => {
      const serviceAvailable = Boolean(service && !isPreviousService(service));
      if (!canWrite || !serviceAvailable) {
        setSaving("error");
        setMutationError(
          !canWrite
            ? blockReason ?? "Connessione non verificata. Operazione non eseguita."
            : "Il servizio non è aperto o appartiene a un giorno precedente.",
        );
        return;
      }
      setSaving("saving");
      setMutationError("");
      selfUpdate.current = true;
      try {
        await task();
        await loadOrder();
      } catch (error) {
        setSaving("error");
        if (isConnectionFailure(error)) markUnreliable();
        setMutationError(
          getErrorMessage(error),
        );
      } finally {
        window.setTimeout(() => {
          selfUpdate.current = false;
        }, 500);
      }
    },
    [blockReason, canWrite, loadOrder, markUnreliable, service],
  );

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
      order
    ) {
      return;
    }
    queueMicrotask(() => void loadOrder(true));
  }, [canWrite, loadOrder, order, service]);

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
    const changes = supabase
      .channel(`order:${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => {
          if (!selfUpdate.current) setExternalUpdate(true);
          void loadOrder();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${orderId}` },
        () => {
          if (!selfUpdate.current) setExternalUpdate(true);
          void loadOrder();
        },
      )
      .subscribe();

    const room = supabase.channel(`table:${tableId}`, {
      config: { presence: { key: profile.id }, private: true },
    });
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
  }, [loadOrder, orderId, profile.full_name, profile.id, tableId]);

  const visibleProducts = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return menuItems.filter((item) => {
      const matchesCategory = search ? true : item.category_id === activeCategory;
      const matchesSearch =
        !needle ||
        `${item.name} ${item.ingredients ?? ""}`.toLowerCase().includes(needle);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, menuItems, search]);

  if (loading || status === "checking" || serviceLoading) {
    return <div className="loader" aria-label="Caricamento comanda" />;
  }
  if (!table || !order) {
    const serviceMessage = !service
      ? "La cassa deve iniziare pranzo o cena prima di aprire il tavolo."
      : isPreviousService(service)
        ? "Il servizio precedente deve essere chiuso dalla cassa prima di creare nuove comande."
        : null;
    return (
      <section className="empty-card">
        <h1>
          {serviceMessage
            ? "Nessun servizio operativo"
            : canWrite
              ? "Tavolo non disponibile"
              : "Comanda non disponibile offline"}
        </h1>
        <p>{serviceMessage ?? (!canWrite ? blockReason : null)}</p>
        <Link className="button button-primary" href="/staff/tables">Torna ai tavoli</Link>
      </section>
    );
  }

  const serviceOperational = Boolean(service && !isPreviousService(service));
  const operationsEnabled = canWrite && serviceOperational;
  const operationalBlockReason = !canWrite
    ? blockReason
    : !service
      ? "Nessun servizio aperto."
      : !serviceOperational
        ? "Il servizio precedente deve essere chiuso dalla cassa."
        : null;
  const editable = order.status === "draft" || profile.role !== "waiter";
  const writeEnabled = editable && operationsEnabled;
  const canVerifySubmission =
    profile.role === "waiter" &&
    order.status === "pending_cashier" &&
    isWithinMinutes(order.sent_to_cashier_at, 15);
  const ayce = validateAllYouCanEat(items, order.cover_count);
  const submissionIssue =
    !operationsEnabled && order.status === "draft"
      ? operationalBlockReason
      : getOrderSubmissionIssue({
          status: order.status,
          itemCount: items.length,
          covers: order.cover_count,
          saving,
          allYouCanEat: ayce,
        });

  return (
    <>
      <section className="order-heading">
        <div>
          <Link className="back-link" href="/staff/tables">← Tutti i tavoli</Link>
          <p className="eyebrow">Comanda #{order.order_number}</p>
          <h1>Tavolo {table.table_number}</h1>
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
        <p className="presence">Tavolo aperto da {presence.join(", ")}</p>
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
          <label className="compact-search product-search">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca prodotto" />
          </label>
          {!search && (
            <nav className="category-tabs" aria-label="Categorie prodotti">
              {categories.filter((category) => category.slug !== "extra").map((category) => (
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
                  void mutate(async () => {
                    const { error } = await createClient().rpc("add_order_item", {
                      p_order_id: order.id,
                      p_menu_item_id: item.id,
                      p_notes: "",
                    });
                    if (error) throw error;
                  })
                }
              >
                <span>{item.name}</span>
                <strong>{item.available ? formatCurrency(item.price) : "Esaurito"}</strong>
                {item.ingredients && <small>{item.ingredients}</small>}
              </button>
            ))}
          </div>
        </section>

        <section className="order-panel">
          <div className="panel-title">
            <div><p className="eyebrow">Ordine</p><h2>Comanda</h2></div>
            <strong>{items.reduce((sum, item) => sum + item.quantity, 0)} prodotti</strong>
          </div>

          <div className="covers-row">
            <span>Coperti</span>
            <div className="stepper">
              <button disabled={!writeEnabled || order.cover_count === 0} onClick={() => void saveDetails(order.cover_count - 1)}>−</button>
              <strong>{order.cover_count}</strong>
              <button disabled={!writeEnabled} onClick={() => void saveDetails(order.cover_count + 1)}>+</button>
            </div>
          </div>

          <div className="order-lines">
            {items.length === 0 && <p className="empty-line">Tocca un prodotto per iniziare.</p>}
            {items.map((item) => (
              <article className="order-line" key={item.id}>
                <div className="line-main">
                  <div><strong>{item.item_name_snapshot}</strong><small>{formatCurrency(item.item_price_snapshot)} cad.</small></div>
                  <strong>{formatCurrency(item.line_total + item.extras.reduce((sum, extra) => sum + extra.total, 0))}</strong>
                </div>
                <div className="line-actions">
                  <div className="stepper small">
                    <button disabled={!writeEnabled} onClick={() => void quantity(item.id, -1)}>−</button>
                    <strong>{item.quantity}</strong>
                    <button disabled={!writeEnabled} onClick={() => void quantity(item.id, 1)}>+</button>
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
                  disabled={!writeEnabled}
                  placeholder="Nota sulla riga…"
                  onBlur={(event) => {
                    if (event.target.value !== item.notes) void saveItemNote(item, event.target.value);
                  }}
                />
                {item.extras.map((extra) => (
                  <p className="extra-line" key={extra.id}>↳ {extra.quantity}× {extra.extra_name_snapshot} · {formatCurrency(extra.total)}</p>
                ))}
                {editable && extras.length > 0 && (
                  <select
                    className="extra-select"
                    defaultValue=""
                    disabled={!operationsEnabled}
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

          {!ayce.valid && <p className="form-error">{submissionIssue}</p>}

          <label className="general-note">
            Nota generale
            <textarea
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
            <p><span>Coperto ({order.cover_count} × {formatCurrency(order.cover_price_snapshot)})</span><strong>{formatCurrency(order.cover_total)}</strong></p>
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
            !operationsEnabled ||
            (order.status === "draft" ? submissionIssue !== null : !canVerifySubmission)
          }
          onClick={() => void submitOrder()}
        >
          {order.status === "draft"
            ? "Invia alla cassa"
            : canVerifySubmission
              ? "Verifica invio e stampa"
              : "Comanda inviata"}
        </button>
      </div>
    </>
  );

  async function saveDetails(covers: number, notes = order!.general_notes) {
    await mutate(async () => {
      const { error } = await createClient().rpc("set_order_details", {
        p_order_id: order!.id,
        p_cover_count: covers,
        p_general_notes: notes,
        p_expected_version: order!.version,
      });
      if (error) throw error;
    });
  }

  async function quantity(itemId: string, delta: number) {
    await mutate(async () => {
      const { error } = await createClient().rpc("change_order_item_quantity", {
        p_item_id: itemId,
        p_delta: delta,
      });
      if (error) throw error;
    });
  }

  async function remove(itemId: string) {
    await mutate(async () => {
      const { error } = await createClient().rpc("remove_order_item", { p_item_id: itemId });
      if (error) throw error;
    });
  }

  async function saveItemNote(item: OrderItem, notes: string) {
    await mutate(async () => {
      const { error } = await createClient().rpc("set_order_item_notes", {
        p_item_id: item.id,
        p_notes: notes,
        p_expected_version: item.version,
      });
      if (error) throw error;
    });
  }

  async function addExtra(itemId: string, extraId: string) {
    await mutate(async () => {
      const { error } = await createClient().rpc("add_order_item_extra", {
        p_item_id: itemId,
        p_menu_extra_id: extraId,
      });
      if (error) throw error;
    });
  }

  async function submitOrder() {
    if (!operationsEnabled) {
      setSaving("error");
      setMutationError(
        operationalBlockReason ?? "Comanda non inviata.",
      );
      return;
    }

    setSaving("saving");
    setMutationError("");
    selfUpdate.current = true;

    try {
      const response = await fetch("/api/print-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order!.id, type: "new_order" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        orderAccepted?: boolean;
        outcome?: "failed" | "uncertain";
      };

      if (!response.ok && !payload.orderAccepted) {
        setSaving("error");
        setMutationError(payload.error ?? "Invio della comanda non riuscito");
        return;
      }

      await loadOrder();
      if (!response.ok) {
        setMutationError(
          payload.outcome === "uncertain"
            ? "Comanda arrivata in cassa. Esito stampa incerto: la cassa deve verificare la stampante."
            : `Comanda arrivata in cassa, ma la stampa è fallita: ${payload.error ?? "interviene la cassa"}.`,
        );
      }
    } catch {
      setSaving("error");
      markUnreliable();
      setMutationError(
        "Connessione non affidabile. Non è possibile confermare l'invio: non chiudere o ricaricare.",
      );
    } finally {
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

function isWithinMinutes(value: string | null, minutes: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= minutes * 60_000;
}
