"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useConnection } from "@/components/connection-provider";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { useCurrentService } from "@/hooks/use-current-service";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { aggregateMenuItemQuantities } from "@/lib/order-calculations";
import { aggregateIdenticalOrderItems, getIdenticalOrderItemIds } from "@/lib/order-items";
import { getInitialPrintDecision } from "@/lib/automatic-print-policy";
import { canEditOrder } from "@/lib/order-workflow";
import { getOrderShortLabel } from "@/lib/order-display";
import { formatServiceLabel, isPreviousService } from "@/lib/service-management";
import { isRealtimeFailureStatus, isRealtimeSubscribedStatus } from "@/lib/realtime-status";
import { createClient } from "@/lib/supabase/client";
import { OrderEditQueue } from "@/lib/order-edit-queue";
import { orderEditPayload, mergeOrderEdits, orderItemVariant, projectOrderEdit, type OrderEdit, type OrderSnapshot } from "@/lib/optimistic-order";
import type { MenuCategory, MenuExtra, MenuItem, Order, OrderItem, Profile, RestaurantTable } from "@/types/domain";

const EMPTY_SNAPSHOT: OrderSnapshot = { order: null, items: [], update_print_status: null };
type NoteDraft = { value: string; original: string };

export function TableOrder({ tableId, orderId: requestedOrderId, profile }: {
  tableId?: string; orderId?: string; profile: Profile;
}) {
  const router = useRouter();
  const takeawayMode = Boolean(requestedOrderId);
  const { status, canWrite: connectionCanWrite, blockReason, markUnreliable, verify } = useConnection();
  const { service, loading: serviceLoading, error: serviceError, state: serviceState } = useCurrentService();
  const [queue] = useState(() => new OrderEditQueue<OrderSnapshot, OrderEdit>(
    EMPTY_SNAPSHOT, projectOrderEdit,
    async (command, base) => {
      const { data, error } = await createClient().rpc("apply_order_edit", {
        p_order_id: base.order?.id, p_operation_id: command.id, p_edit: orderEditPayload(command.edit),
      });
      if (error) throw error;
      if (!data?.order || !Array.isArray(data.items)) throw new Error("Conferma del salvataggio incompleta. Riprova la stessa operazione.");
      return data as OrderSnapshot;
    },
    errorMessage, mergeOrderEdits,
  ));
  const queueState = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const { order, items, update_print_status: updatePrintStatus } = queueState.visible;
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [catalogueReady, setCatalogueReady] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [presence, setPresence] = useState<string[]>([]);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [quantityPicker, setQuantityPicker] = useState<{ item?: OrderItem; product?: MenuItem; covers?: boolean } | null>(null);
  const [quantityDraft, setQuantityDraft] = useState("1");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const noteDraftsRef = useRef(noteDrafts);
  const orderPanelRef = useRef<HTMLElement>(null);
  const pickerRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const initialLoad = useRef(false);
  const loadGeneration = useRef(0);
  const catalogueGeneration = useRef(0);
  const refreshDeferred = useRef(false);
  const hasLoaded = useRef(false);

  const serviceOperational = Boolean(service && !isPreviousService(service));
  const operationsEnabled = connectionCanWrite && dataReady && catalogueReady && serviceState === "ready" && serviceOperational;
  const writeEnabled = operationsEnabled && Boolean(order && canEditOrder(order.status)) && !submitting && !queueState.error;
  const pendingCount = queueState.pending.length;
  const saving = queueState.error ? "error" : pendingCount ? "saving" : "saved";

  const loadOrder = useCallback(async (create = false, recover = false) => {
    if (queue.getSnapshot().pending.length && !recover) { refreshDeferred.current = true; return; }
    const generation = ++loadGeneration.current;
    const revision = queue.getRevision();
    try {
      const supabase = createClient();
      const result = takeawayMode
        ? await supabase.from("orders").select("*").eq("id", requestedOrderId!).eq("order_type", "takeaway").in("status", [...ACTIVE_ORDER_STATUSES]).maybeSingle()
        : create
          ? await supabase.rpc("get_or_create_active_order", { p_table_id: tableId })
          : await supabase.from("orders").select("*").eq("table_id", tableId!).in("status", ["draft", "pending_cashier", "confirmed", "in_preparation", "bill_requested"]).maybeSingle();
      if (result.error) throw result.error;
      const current = result.data as Order | null;
      let snapshot: OrderSnapshot = { ...EMPTY_SNAPSHOT, order: current };
      if (current) {
        const { data, error } = await supabase.rpc("get_order_edit_snapshot", { p_order_id: current.id });
        if (error) throw error;
        if (!data?.order || !Array.isArray(data.items)) throw new Error("Comanda non disponibile.");
        snapshot = data as OrderSnapshot;
      }
      if (generation !== loadGeneration.current) return;
      const accepted = recover ? queue.discardAndAccept(snapshot) : queue.acceptSnapshot(snapshot, revision);
      if (!accepted) { refreshDeferred.current = true; return; }
      setLoadError(""); setDataReady(true); hasLoaded.current = true;
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setLoadError(`Comanda non aggiornata. ${errorMessage(error)}`); setDataReady(false);
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [queue, requestedOrderId, tableId, takeawayMode]);
  const scheduleOrderRefresh = useCoalescedRefresh(loadOrder);

  const loadCatalogue = useCallback(async () => {
    const generation = ++catalogueGeneration.current;
    const supabase = createClient();
    const [tables, categoryResult, products, additions] = await Promise.all([
      tableId ? supabase.from("restaurant_tables").select("*").eq("id", tableId).single() : Promise.resolve({ data: null, error: null }),
      supabase.from("menu_categories").select("*").eq("active", true).order("sort_order").order("name"),
      supabase.from("menu_items").select("*").eq("active", true).eq("visible_staff", true).order("category_id").order("sort_order").order("name"),
      supabase.from("menu_extras").select("*").eq("active", true).eq("visible_staff", true).order("sort_order"),
    ]);
    if (generation !== catalogueGeneration.current) return;
    const error = tables.error ?? categoryResult.error ?? products.error ?? additions.error;
    if (error) { setCatalogueError(`Catalogo non aggiornato. ${errorMessage(error)}`); setCatalogueReady(false); return; }
    const loaded = (categoryResult.data ?? []) as MenuCategory[];
    setCatalogueReady(true); setCatalogueError("");
    setTable(tables.data as RestaurantTable | null);
    setCategories(loaded); setMenuItems((products.data ?? []) as MenuItem[]); setExtras((additions.data ?? []) as MenuExtra[]);
    const selectable = loaded.filter((category) => category.slug !== "extra" && !(takeawayMode && category.slug === "all-you-can-eat"));
    setActiveCategory((current) => selectable.some((category) => category.id === current) ? current : selectable[0]?.id ?? "");
    return true;
  }, [tableId, takeawayMode]);
  const scheduleCatalogueRefresh = useCoalescedRefresh(async () => {
    if (await loadCatalogue()) await loadOrder();
  });

  useEffect(() => {
    if (status === "checking" || serviceLoading || initialLoad.current) return;
    initialLoad.current = true;
    queueMicrotask(async () => {
      const loaded = await loadCatalogue();
      if (loaded) await loadOrder(Boolean(connectionCanWrite && service && !isPreviousService(service)));
      else setLoading(false);
    });
  }, [connectionCanWrite, loadCatalogue, loadOrder, service, serviceLoading, status]);

  useEffect(() => {
    if (status !== "online" || !hasLoaded.current) return;
    scheduleCatalogueRefresh();
  }, [status, scheduleCatalogueRefresh]);

  useEffect(() => {
    if (!pendingCount && !queueState.running && !queueState.error && refreshDeferred.current) {
      refreshDeferred.current = false; scheduleOrderRefresh();
    }
  }, [pendingCount, queueState.running, queueState.error, scheduleOrderRefresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`order-catalogue:${tableId ?? requestedOrderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, scheduleCatalogueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, scheduleCatalogueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_extras" }, scheduleCatalogueRefresh)
      .subscribe((state: string) => {
        if (isRealtimeFailureStatus(state)) { setCatalogueReady(false); setCatalogueError("Aggiornamenti del catalogo interrotti. Riprova."); }
        if (isRealtimeSubscribedStatus(state) && hasLoaded.current) scheduleCatalogueRefresh();
      });
    return () => { void supabase.removeChannel(channel); };
  }, [requestedOrderId, scheduleCatalogueRefresh, tableId]);

  const orderId = order?.id;
  useEffect(() => {
    if (!orderId) return;
    const supabase = createClient();
    const channel = supabase.channel(`order:${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, (payload: { new: Record<string, unknown> }) => {
        if (payload.new.updated_by && payload.new.updated_by !== profile.id) setExternalUpdate(true);
        scheduleOrderRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs", filter: `order_id=eq.${orderId}` }, scheduleOrderRefresh)
      .subscribe((state: string) => {
        if (isRealtimeFailureStatus(state)) { setDataReady(false); setLoadError("Aggiornamenti della comanda interrotti. Riprova."); }
        if (isRealtimeSubscribedStatus(state)) scheduleOrderRefresh();
      });
    const room = supabase.channel(tableId ? `table:${tableId}` : `table:takeaway:${orderId}`, { config: { presence: { key: profile.id }, private: true } });
    room.on("presence", { event: "sync" }, () => {
      setPresence([...new Set(Object.values(room.presenceState()).flat().filter((entry) => (entry as { user_id?: string }).user_id !== profile.id).map((entry) => String((entry as { name?: string }).name ?? "Staff")))]);
    }).subscribe(async (state: string) => { if (state === "SUBSCRIBED") await room.track({ user_id: profile.id, name: profile.full_name }); });
    return () => { void supabase.removeChannel(channel); void supabase.removeChannel(room); };
  }, [orderId, profile.full_name, profile.id, scheduleOrderRefresh, tableId]);

  const enqueue = useCallback((edit: OrderEdit, label: string) => {
    if (!operationsEnabled || submittingRef.current || queue.getSnapshot().error) return false;
    const current = queue.getSnapshot().visible;
    const scopedIds = edit.type === "quantity" || edit.type === "remove" ? edit.item_ids :
      edit.type === "note" || edit.type === "extra" || edit.type === "remove_extra" ? [edit.item_id] : [];
    const rawItems = current.items.filter((item) => scopedIds.includes(item.id));
    if (scopedIds.length && rawItems.length !== scopedIds.length) { setMessage("La riga è cambiata. Selezionala di nuovo."); return false; }
    if (edit.type !== "remove" && rawItems.some((item) => item.extras.some((extra) => extra.quantity % item.quantity !== 0))) {
      setMessage("Questa riga precedente contiene extra su quantità diverse. Aggiungi una nuova variante per modificarla."); return false;
    }
    const command: OrderEdit = { ...edit,
      ...(rawItems.length ? { expected_variants: Object.fromEntries(rawItems.map((item) => [item.id, orderItemVariant(item)])) } : {}),
      ...(edit.type === "note" || edit.type === "extra" || edit.type === "remove_extra" ? { expected_quantity: rawItems[0].quantity } : {}),
      ...(edit.type === "details" && edit.cover_count !== undefined ? { expected_cover_count: current.order?.cover_count } : {}),
    };
    setMessage("");
    return queue.enqueue({ id: crypto.randomUUID(), edit: command, label });
  }, [operationsEnabled, queue]);

  function changeNote(key: string, value: string, original: string) {
    const next = { ...noteDraftsRef.current, [key]: { value, original: noteDraftsRef.current[key]?.original ?? original } };
    noteDraftsRef.current = next; setNoteDrafts(next);
  }
  const commitNotes = useCallback((onlyKey?: string) => {
    const next = { ...noteDraftsRef.current };
    let succeeded = true;
    for (const [key, draft] of Object.entries(next)) {
      if (onlyKey && key !== onlyKey) continue;
      if (draft.value !== draft.original) {
        const accepted = enqueue(key === "general" ? {
          type: "details", general_notes: draft.value, expected_general_notes: draft.original,
        } : { type: "note", item_id: key, notes: draft.value, expected_notes: draft.original, new_item_id: crypto.randomUUID() }, "Nota");
        if (!accepted) { succeeded = false; continue; }
      }
      delete next[key];
    }
    noteDraftsRef.current = next; setNoteDrafts(next);
    return succeeded;
  }, [enqueue]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.getSnapshot().pending.length || Object.keys(noteDraftsRef.current).length || submittingRef.current) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    const hidden = () => { if (document.visibilityState === "hidden") { commitNotes(); void queue.flush(); } };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.origin !== window.location.origin || link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (!queue.getSnapshot().pending.length && !Object.keys(noteDraftsRef.current).length && !submittingRef.current) return;
      if (link.pathname === window.location.pathname && link.hash) return;
      event.preventDefault(); event.stopPropagation();
      if (submittingRef.current) { setMessage("Invio in corso. Attendi la conferma prima di uscire."); return; }
      if (commitNotes()) void queue.flush().then((saved) => { if (saved) router.push(link.pathname + link.search + link.hash); });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("click", navigate, true);
    };
  }, [commitNotes, queue, router]);

  useEffect(() => {
    if (quantityPicker) pickerRef.current?.showModal();
    else pickerRef.current?.close();
  }, [quantityPicker]);

  const displayedItems = useMemo(() => aggregateIdenticalOrderItems(items), [items]);
  const menuItemQuantities = useMemo(() => aggregateMenuItemQuantities(items), [items]);
  const productCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const selectableCategories = categories.filter((category) => category.slug !== "extra" && !(takeawayMode && category.slug === "all-you-can-eat"));
  const visibleProducts = menuItems.filter((item) => {
    if (!selectableCategories.some((category) => category.id === item.category_id)) return false;
    const needle = search.trim().toLocaleLowerCase("it");
    return needle ? `${item.name} ${item.ingredients ?? ""}`.toLocaleLowerCase("it").includes(needle) : item.category_id === activeCategory;
  });

  if (loading || serviceLoading) return <div className="loader" aria-label="Caricamento comanda" />;
  if (!order) return <section className="empty-card">
    <h1>{loadError ? "Comanda non disponibile" : "Nessuna comanda aperta"}</h1>
    <p>{catalogueError || loadError || serviceError || (!serviceOperational ? "La cassa deve aprire il servizio di oggi." : "Apri la comanda per iniziare.")}</p>
    <button className="button button-primary" onClick={() => void loadCatalogue().then((loaded) => loaded && loadOrder(connectionCanWrite && serviceOperational))}>Riprova</button>
    <Link className="button" href={takeawayMode ? "/asporti" : "/staff/tables"}>Torna {takeawayMode ? "agli asporti" : "ai tavoli"}</Link>
  </section>;

  const canVerifySubmission = order.status === "pending_cashier" && getInitialPrintDecision(profile, order) === "allowed";
  const canSubmit = writeEnabled && productCount > 0 && (order.status === "draft" || updatePrintStatus === "pending" || canVerifySubmission);
  const block = !connectionCanWrite ? blockReason : serviceState !== "ready" ? serviceError : !serviceOperational ? "La cassa deve aprire il servizio di oggi." : catalogueError || loadError;
  const label = getOrderShortLabel({ ...order, table: table ?? undefined });

  return <>
    <section className="order-heading">
      <div>
        <Link className="back-link" href={takeawayMode ? "/asporti" : "/staff/tables"}>← {takeawayMode ? "Asporti" : "Tavoli"}</Link>
        <p className="eyebrow">Comanda #{order.order_number}</p><h1>{label}</h1>
        {takeawayMode && order.takeaway_pickup_at && <p className="takeaway-pickup">Ritiro alle {new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(order.takeaway_pickup_at))}</p>}
        {service && <p className="service-context">{formatServiceLabel(service)}</p>}
      </div>
      <div className="order-live-status" aria-live="polite">
        <span className={`save-state save-${saving}`}>{queueState.error ? "Da verificare" : pendingCount ? `Salvataggio… (${pendingCount})` : "Salvato"}</span>
        <span className="status-label">{ORDER_STATUS_LABELS[order.status]}</span>
      </div>
    </section>
    {presence.length > 0 && <p className="presence">Anche {presence.join(", ")} sta consultando la comanda.</p>}
    {externalUpdate && <button className="external-update" onClick={() => setExternalUpdate(false)}>Comanda aggiornata da un altro operatore · Chiudi</button>}
    {block && <section className="connection-action-hint" role="alert">{block} <button className="text-button" onClick={() => void verify().then(() => loadCatalogue()).then((loaded) => loaded && loadOrder())}>Verifica connessione e aggiorna</button></section>}
    {queueState.error && <section className="order-save-error" role="alert">
      <strong>Salvataggio da verificare</strong><p>{queueState.error}</p>
      <p>{pendingCount} modifiche restano in attesa. I valori mostrati non sono ancora confermati.</p>
      <button className="button button-primary" onClick={() => void verify().then((online) => online && queue.retry())}>Riprova salvataggio</button>
      <button className="button" onClick={() => {
        if (window.confirm("Rileggere la comanda dal server? Le modifiche ancora in attesa verranno abbandonate; quelle già registrate resteranno nell’ordine.")) void loadOrder(false, true);
      }}>Rileggi e abbandona modifiche in attesa</button>
    </section>}
    {message && <p className="connection-action-hint" role="status">{message}</p>}

    <div className={`order-layout fast-order-layout ${summaryOpen ? "summary-is-open" : ""}`}>
      <section className="product-picker">
        <div className="order-catalogue-tools">
          <div className="covers-row covers-row-menu">
            {order.order_type === "dine_in" ? <>
              <span>Coperti</span><div className="stepper">
                <button aria-label="Diminuisci coperti" disabled={!writeEnabled || order.cover_count <= 0} onClick={() => enqueue({ type: "details", cover_count: queue.getSnapshot().visible.order!.cover_count - 1 }, "Coperti")}>−</button>
                <button className="covers-count-button" aria-label={`Scegli coperti, ${order.cover_count}`} disabled={!writeEnabled} onClick={() => openQuantity({ covers: true }, order.cover_count)}>{order.cover_count}</button>
                <button aria-label="Aumenta coperti" disabled={!writeEnabled || order.cover_count >= 99} onClick={() => enqueue({ type: "details", cover_count: queue.getSnapshot().visible.order!.cover_count + 1 }, "Coperti")}>+</button>
              </div>
            </> : <strong>Prodotti da asporto</strong>}
          </div>
          <label className="compact-search product-search"><span aria-hidden="true">⌕</span><input aria-label="Cerca prodotto" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca prodotto" />{search && <button className="text-button" aria-label="Cancella ricerca" onClick={() => setSearch("")}>×</button>}</label>
          {!search.trim() && <nav className="category-tabs" aria-label="Categorie prodotti">{selectableCategories.map((category) => <button aria-pressed={activeCategory === category.id} className={activeCategory === category.id ? "active" : ""} key={category.id} onClick={() => setActiveCategory(category.id)}>{category.name}</button>)}</nav>}
        </div>
        <div className="product-grid">
          {visibleProducts.map((product) => <div className="order-product-tile" key={product.id}>
            <button className="product-button" disabled={!writeEnabled || !product.available} onClick={() => addProduct(product, 1)} aria-label={`Aggiungi ${product.name}`}>
              {(menuItemQuantities[product.id] ?? 0) > 0 && <span className="product-quantity-badge" aria-label={`${menuItemQuantities[product.id]} inseriti`}>{menuItemQuantities[product.id]}</span>}
              <span>{product.name}</span><strong>{product.available ? formatCurrency(product.price) : "Esaurito"}</strong>
              {product.ingredients && <small>{product.ingredients}</small>}
            </button>
            <button className="product-multiple" disabled={!writeEnabled || !product.available} aria-label={`Scegli quantità di ${product.name}`} onClick={() => openQuantity({ product }, 1)}>Quantità…</button>
          </div>)}
        </div>
        {!visibleProducts.length && <div className="empty-line"><p>{search ? "Nessun prodotto trovato." : "Nessun prodotto in questa categoria."}</p>{search && <button className="button" onClick={() => setSearch("")}>Cancella ricerca</button>}</div>}
      </section>

      <section className="order-panel" ref={orderPanelRef} tabIndex={-1} id="table-order-summary" aria-label="Riepilogo comanda">
        <div className="panel-title"><div><p className="eyebrow">Ordine</p><h2>Comanda</h2></div><strong>{productCount} prodotti</strong><button className="text-button order-back-to-menu" onClick={() => setSummaryOpen(false)}>← Menu</button></div>
        <div className="order-lines">
          {!displayedItems.length && <p className="empty-line">Tocca un prodotto per iniziare.</p>}
          {displayedItems.map((item) => <article className={`order-line ${item.extras.length || item.notes ? "has-variant" : ""}`} key={item.id}>
            <div className="line-main"><div><strong>{item.item_name_snapshot}</strong><small>{formatCurrency(item.item_price_snapshot)} cad.</small></div><strong>{formatCurrency(item.line_total + item.extras.reduce((sum, extra) => sum + extra.total, 0))}</strong></div>
            {item.notes && <p className="order-variant-note">{item.notes}</p>}
            {item.extras.length > 0 && <div className="order-variant-extras">{item.extras.map((extra) => <span key={extra.id}>+ {extra.extra_name_snapshot}{extra.quantity / item.quantity !== 1 ? ` (${extra.quantity / item.quantity} per prodotto)` : ""}</span>)}<small>Gli extra sono inclusi in ogni prodotto di questa riga.</small></div>}
            <div className="line-actions"><div className="stepper small">
              <button aria-label={`Diminuisci ${item.item_name_snapshot}`} disabled={!writeEnabled} onClick={() => changeQuantity(item, -1)}>−</button>
              <button className="line-count-button" aria-label={`Modifica quantità ${item.item_name_snapshot}, ${item.quantity}`} disabled={!writeEnabled} onClick={() => openQuantity({ item }, item.quantity)}>{item.quantity}</button>
              <button aria-label={`Aumenta ${item.item_name_snapshot}`} disabled={!writeEnabled || item.quantity >= 999} onClick={() => changeQuantity(item, 1)}>+</button>
            </div><button className="danger-link" disabled={!writeEnabled} onClick={() => enqueue({ type: "remove", item_ids: groupIds(item) }, "Rimuovi riga")}>Rimuovi {item.quantity > 1 ? `tutti (${item.quantity})` : ""}</button></div>
            <details className="order-customization"><summary>Nota / extra{item.quantity > 1 ? " su un prodotto" : ""}</summary>
              {item.quantity > 1 && <p className="variant-help">La modifica separa un prodotto dagli altri. Poi usa + per aumentare la nuova variante.</p>}
              <label className="order-note-label">Nota sul prodotto<input className="line-note" aria-label={`Nota ${item.item_name_snapshot}`} value={noteDrafts[item.id]?.value ?? item.notes} maxLength={300} disabled={!writeEnabled} placeholder="Es. senza mozzarella…" onChange={(event) => changeNote(item.id, event.target.value, item.notes)} onBlur={() => commitNotes(item.id)} /></label>
              {item.extras.map((extra) => <div className="extra-line" key={extra.id}><span>+ {extra.extra_name_snapshot} · {formatCurrency(extra.total / item.quantity)} cad.</span><button aria-label={`Rimuovi extra ${extra.extra_name_snapshot} da un prodotto`} disabled={!writeEnabled || extra.id.includes(":")} onClick={() => enqueue({ type: "remove_extra", item_id: item.id, extra_id: extra.id, new_item_id: crypto.randomUUID() }, "Rimuovi extra")}>×</button></div>)}
              {extras.length > 0 && <select className="extra-select" aria-label={`Aggiungi extra a ${item.item_name_snapshot}`} value="" disabled={!writeEnabled} onChange={(event) => {
                const extra = extras.find((entry) => entry.id === event.target.value);
                if (extra) enqueue({ type: "extra", item_id: item.id, extra_id: extra.id, new_item_id: crypto.randomUUID(), extra }, "Aggiungi extra");
              }}><option value="">+ Aggiungi extra</option>{extras.filter((extra) => extra.available).map((extra) => <option key={extra.id} value={extra.id}>{extra.name} · {formatCurrency(extra.price)}</option>)}</select>}
            </details>
          </article>)}
        </div>
        <label className="general-note">Nota generale<textarea value={noteDrafts.general?.value ?? order.general_notes} maxLength={500} disabled={!writeEnabled} placeholder="Es. portare tutto insieme…" onChange={(event) => changeNote("general", event.target.value, order.general_notes)} onBlur={() => commitNotes("general")} /></label>
        <div className="totals"><p><span>Subtotale</span><strong>{formatCurrency(order.subtotal)}</strong></p>{order.order_type === "dine_in" && <p><span>Coperto ({order.cover_count} × {formatCurrency(order.cover_price_snapshot)})</span><strong>{formatCurrency(order.cover_total)}</strong></p>}<p className="grand-total"><span>Totale{pendingCount ? " provvisorio" : ""}</span><strong>{formatCurrency(order.total)}</strong></p></div>
      </section>
    </div>

    <div className="order-bottom-bar fast-order-bottom-bar">
      <button className="order-summary-toggle" aria-expanded={summaryOpen} aria-controls="table-order-summary" onClick={() => {
        setSummaryOpen((value) => !value);
        if (window.matchMedia("(min-width: 901px)").matches) { orderPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); orderPanelRef.current?.focus({ preventScroll: true }); }
      }}><span>{summaryOpen ? "← Menu" : `Vedi ordine · ${productCount} prodotti`}</span><strong>{formatCurrency(order.total)}</strong>{pendingCount > 0 && <small>Salvataggio…</small>}</button>
      <button className="button button-primary button-large" disabled={!canSubmit} onClick={() => void submitOrder()}>{submitting ? "Invio…" : order.status === "draft" ? "Invia alla cassa" : updatePrintStatus === "pending" ? "Invia aggiornamento" : order.status === "pending_cashier" ? "Verifica invio e stampa" : updatePrintStatus === "printing" ? "Aggiornamento in stampa" : updatePrintStatus === "failed" ? "Stampa da verificare in cassa" : "Comanda aggiornata"}</button>
    </div>

    <dialog className="order-quantity-dialog" ref={pickerRef} onCancel={() => closeQuantity()} onClose={() => { setQuantityPicker(null); returnFocusRef.current?.focus(); }}>
      {quantityPicker && <form onSubmit={(event) => { event.preventDefault(); confirmQuantity(); }}>
        <h2>{quantityPicker.covers ? "Coperti" : quantityPicker.product?.name ?? quantityPicker.item?.item_name_snapshot}</h2>
        <label>Quantità<input aria-label="Quantità" autoFocus type="number" inputMode="numeric" min={quantityPicker.covers ? 0 : 1} max={quantityPicker.covers ? 99 : 999} step="1" value={quantityDraft} onFocus={(event) => event.target.select()} onChange={(event) => setQuantityDraft(event.target.value)} required /></label>
        {quantityPicker.product && <p>{formatCurrency(quantityPicker.product.price * (Number(quantityDraft) || 0))}</p>}
        <div className="quantity-shortcuts">{[1, 2, 3, 5, 10].map((quantity) => <button type="button" key={quantity} onClick={() => setQuantityDraft(String(quantity))}>{quantity}</button>)}</div>
        <div className="modal-actions"><button className="button" type="button" onClick={closeQuantity}>Annulla</button><button className="button button-primary" disabled={!writeEnabled}>{quantityPicker.product ? `Aggiungi ${quantityDraft || ""}` : "Conferma"}</button></div>
      </form>}
    </dialog>
  </>;

  function groupIds(item: OrderItem) { return getIdenticalOrderItemIds(queue.getSnapshot().visible.items, item.id); }
  function addProduct(product: MenuItem, quantity: number) {
    enqueue({ type: "add", item_id: crypto.randomUUID(), menu_item_id: product.id, quantity, product }, `Aggiungi ${quantity} ${product.name}`);
  }
  function changeQuantity(item: OrderItem, delta: number) {
    enqueue({ type: "quantity", item_ids: groupIds(item), delta }, `Quantità ${item.item_name_snapshot}`);
  }
  function openQuantity(target: NonNullable<typeof quantityPicker>, quantity: number) {
    returnFocusRef.current = document.activeElement as HTMLElement;
    setQuantityDraft(String(quantity)); setQuantityPicker(target);
  }
  function closeQuantity() { pickerRef.current?.close(); setQuantityPicker(null); }
  function confirmQuantity() {
    const quantity = Number(quantityDraft);
    if (!quantityPicker || !Number.isInteger(quantity) || quantity < (quantityPicker.covers ? 0 : 1) || quantity > (quantityPicker.covers ? 99 : 999)) return;
    if (quantityPicker.product) addProduct(quantityPicker.product, quantity);
    if (quantityPicker.covers) enqueue({ type: "details", cover_count: quantity }, "Coperti");
    if (quantityPicker.item) {
      const current = aggregateIdenticalOrderItems(queue.getSnapshot().visible.items).find((item) => item.id === quantityPicker.item!.id);
      if (!current) { setMessage("La riga è cambiata. Scegli di nuovo la quantità."); closeQuantity(); return; }
      if (quantity !== current.quantity) changeQuantity(current, quantity - current.quantity);
    }
    closeQuantity();
  }
  async function submitOrder() {
    if (submittingRef.current || !operationsEnabled || !commitNotes()) return;
    submittingRef.current = true; setSubmitting(true); setMessage("");
    try {
      if (!await queue.flush()) return;
      const current = queue.getSnapshot().base;
      if (!current.order || !current.items.length) return;
      const type = current.order.status === "draft" || current.update_print_status !== "pending" ? "new_order" : "order_update";
      setMessage("Comanda salvata. Invio alla cassa e verifica della stampa…");
      const response = await fetch("/api/print-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: current.order.id, type }) });
      const payload = await response.json() as { error?: string; orderAccepted?: boolean; outcome?: string };
      await loadOrder();
      if (!response.ok) setMessage(payload.orderAccepted ? "Comanda ricevuta. La cassa deve verificare la stampa." : payload.error ?? "Invio non riuscito. Verifica la comanda prima di riprovare.");
      else setMessage("Comanda ricevuta dalla cassa.");
    } catch {
      markUnreliable(); setMessage("Conferma di invio non ricevuta. Verifica la connessione e lo stato in cassa prima di riprovare.");
    } finally { submittingRef.current = false; setSubmitting(false); }
  }
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    if (error.message.includes("apply_order_edit")) return "L’aggiornamento del server ordini non è ancora disponibile. Le modifiche restano in attesa.";
    return error.message;
  }
  return "Connessione interrotta. Riprova: la stessa operazione non verrà duplicata.";
}
