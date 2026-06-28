"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUICK_NOTES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import {
  getOrderSubmissionIssue,
  validateAllYouCanEat,
} from "@/lib/order-calculations";
import { createClient } from "@/lib/supabase/client";
import type {
  MenuCategory,
  MenuExtra,
  MenuItem,
  Order,
  OrderItem,
  Profile,
  RestaurantTable,
} from "@/types/domain";

type QueueTask = () => Promise<void>;

export function TableOrder({ tableId, profile }: { tableId: string; profile: Profile }) {
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
  const queue = useRef<QueueTask[]>([]);
  const selfUpdate = useRef(false);

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
          setLoading(false);
          return;
        }
        currentOrder = data as Order;
      } else {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .eq("table_id", tableId)
          .in("status", ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"])
          .maybeSingle();
        currentOrder = data as Order | null;
      }

      if (!currentOrder) {
        setLoading(false);
        return;
      }

      const { data: lines } = await supabase
        .from("order_items")
        .select("*, extras:order_item_extras(*)")
        .eq("order_id", currentOrder.id)
        .order("created_at");
      setOrder(currentOrder);
      setItems((lines ?? []) as OrderItem[]);
      setSaving("saved");
      setLoading(false);
    },
    [tableId],
  );

  const loadBase = useCallback(async () => {
    const supabase = createClient();
    const [tableResult, categoryResult, itemResult, extraResult] = await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("id", tableId).single(),
      supabase.from("menu_categories").select("*").eq("active", true).order("sort_order"),
      supabase.from("menu_items").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
      supabase.from("menu_extras").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
    ]);
    const loadedCategories = (categoryResult.data ?? []) as MenuCategory[];
    setTable(tableResult.data as RestaurantTable);
    setCategories(loadedCategories);
    setMenuItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setActiveCategory((current) => current || loadedCategories[0]?.id || "");
    await loadOrder(true);
  }, [loadOrder, tableId]);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine || queue.current.length === 0) return;
    setSaving("saving");
    const pending = [...queue.current];
    queue.current = [];
    for (const task of pending) {
      try {
        await task();
      } catch {
        queue.current.push(task);
      }
    }
    if (queue.current.length) setSaving("error");
    else await loadOrder();
  }, [loadOrder]);

  const mutate = useCallback(
    async (task: QueueTask) => {
      if (!navigator.onLine) {
        queue.current.push(task);
        setSaving("error");
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
        setMutationError(
          error instanceof Error ? error.message : "Operazione non riuscita.",
        );
      } finally {
        window.setTimeout(() => {
          selfUpdate.current = false;
        }, 500);
      }
    },
    [loadOrder],
  );

  useEffect(() => {
    queueMicrotask(() => void loadBase());
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue, loadBase]);

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

  if (loading) return <div className="loader" aria-label="Caricamento comanda" />;
  if (!table || !order) {
    return (
      <section className="empty-card">
        <h1>Tavolo non disponibile</h1>
        <Link className="button button-primary" href="/staff/tables">Torna ai tavoli</Link>
      </section>
    );
  }

  const editable = order.status === "draft" || profile.role !== "waiter";
  const ayce = validateAllYouCanEat(items, order.cover_count);
  const submissionIssue = getOrderSubmissionIssue({
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
        </div>
        <div className="order-live-status">
          <span className={`save-state save-${saving}`}>
            {saving === "saved" ? "Salvato" : saving === "saving" ? "Salvataggio…" : "Da sincronizzare"}
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
                disabled={!editable || !item.available}
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
              <button disabled={!editable || order.cover_count === 0} onClick={() => void saveDetails(order.cover_count - 1)}>−</button>
              <strong>{order.cover_count}</strong>
              <button disabled={!editable} onClick={() => void saveDetails(order.cover_count + 1)}>+</button>
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
                    <button disabled={!editable} onClick={() => void quantity(item.id, -1)}>−</button>
                    <strong>{item.quantity}</strong>
                    <button disabled={!editable} onClick={() => void quantity(item.id, 1)}>+</button>
                  </div>
                  <button className="danger-link" disabled={!editable} onClick={() => void remove(item.id)}>Rimuovi</button>
                </div>
                <div className="quick-notes">
                  {QUICK_NOTES.map((note) => (
                    <button
                      disabled={!editable}
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
                  disabled={!editable}
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
              disabled={!editable}
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
          disabled={order.status !== "draft" || submissionIssue !== null}
          onClick={() =>
            void mutate(async () => {
              const { error } = await createClient().rpc("send_order_to_cashier", { p_order_id: order.id });
              if (error) throw error;
            })
          }
        >
          {order.status === "draft" ? "Invia alla cassa" : "Comanda inviata"}
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
}
