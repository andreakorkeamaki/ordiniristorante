"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { formatCurrency } from "@/lib/format";
import { readFailureState } from "@/lib/reliable-data-state";
import {
  reorderCategoryMenuItems,
  type DropPlacement,
} from "@/lib/menu-ordering";
import { normalizeCategorySlug } from "@/lib/menu-categories";
import { createClient } from "@/lib/supabase/client";
import type {
  MenuCategory,
  MenuExtra,
  MenuItem,
  OrderTicketPrintMode,
  PreparationArea,
  RestaurantSettings,
  RestaurantTable,
} from "@/types/domain";

type Tab = "menu" | "extras" | "tables" | "settings";
type Feedback = { text: string; type: "success" | "error" };
type ProductDropTarget = {
  itemId: string;
  placement: DropPlacement;
};

export function AdminDashboard() {
  const {
    canWrite: connectionCanWrite,
    blockReason,
    markUnreliable,
  } = useConnection();
  const [tab, setTab] = useState<Tab>("menu");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [printModePreview, setPrintModePreview] =
    useState<OrderTicketPrintMode>("department_split");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggedProduct, setDraggedProduct] = useState<{
    categoryId: string;
    itemId: string;
  } | null>(null);
  const [productDropTarget, setProductDropTarget] =
    useState<ProductDropTarget | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const loadGeneration = useRef(0);
  const hasSnapshot = useRef(false);
  const [dataState, setDataState] = useState<"loading" | "ready" | "stale" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const canWrite = connectionCanWrite && dataState === "ready";

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const supabase = createClient();
    const [categoryResult, itemResult, extraResult, tableResult, settingsResult] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order").order("name"),
      supabase
        .from("menu_items")
        .select("*")
        .order("category_id")
        .order("sort_order")
        .order("name"),
      supabase.from("menu_extras").select("*").order("sort_order"),
      supabase.from("restaurant_tables").select("*").order("table_number"),
      supabase.from("restaurant_settings").select("*").single(),
    ]);
    const error =
      categoryResult.error ??
      itemResult.error ??
      extraResult.error ??
      tableResult.error ??
      settingsResult.error;
    if (error) {
      if (!error.code) markUnreliable();
      if (generation !== loadGeneration.current) return;
      setLoadError("Configurazione non aggiornata. Le modifiche restano bloccate.");
      setDataState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }
    if (generation !== loadGeneration.current) return;
    setCategories((categoryResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setTables((tableResult.data ?? []) as RestaurantTable[]);
    const loadedSettings = settingsResult.data as RestaurantSettings | null;
    setSettings(loadedSettings);
    setPrintModePreview(
      loadedSettings?.order_ticket_print_mode ?? "department_split",
    );
    hasSnapshot.current = true;
    setLoadError("");
    setDataState("ready");
    setLoading(false);
  }, [markUnreliable]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    if (feedback?.type === "success") {
      feedbackTimer.current = window.setTimeout(() => setFeedback(null), 1_500);
    }
    return () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    };
  }, [feedback]);

  if (loading && dataState === "loading") {
    return <div className="loader" aria-label="Caricamento amministrazione" />;
  }

  return (
    <>
      <section className="workspace-heading">
        <div><p className="eyebrow">Configurazione</p><h1>Amministrazione</h1><p>Le modifiche al menu vengono pubblicate in tempo reale.</p></div>
      </section>
      {dataState !== "ready" && (
        <section className="connection-action-hint" role="alert">
          <strong>Dati amministrativi non affidabili.</strong> {loadError}
          <button className="text-button" onClick={() => void load()}>
            Riprova
          </button>
        </section>
      )}
      {feedback && (
        <button
          className={`admin-toast ${feedback.type === "error" ? "is-error" : ""}`}
          onClick={() => setFeedback(null)}
          role="status"
        >
          {feedback.text}{feedback.type === "error" ? " · Chiudi" : ""}
        </button>
      )}
      {!canWrite && (
        <p className="connection-action-hint" role="status">
          {blockReason} Le configurazioni restano consultabili, ma non modificabili.
        </p>
      )}
      <nav className="admin-tabs">
        {([
          ["menu", "Menu"],
          ["extras", "Extra"],
          ["tables", "Tavoli"],
          ["settings", "Impostazioni"],
        ] as [Tab, string][]).map(([value, label]) => (
          <button className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label}</button>
        ))}
      </nav>

      <fieldset className="admin-write-scope" disabled={!canWrite || saving}>
      {tab === "menu" && (
        <div className="admin-grid">
          <section className="admin-panel">
            <div className="panel-title"><div><p className="eyebrow">Struttura</p><h2>Categorie</h2></div></div>
            <form className="inline-create" onSubmit={createCategory}>
              <input name="name" placeholder="Nuova categoria" maxLength={120} required />
              <input name="slug" placeholder="slug" required />
              <button className="button button-primary">{saving ? "Salvataggio…" : "Aggiungi"}</button>
            </form>
            <div className="admin-list">
              {categories.map((category, index) => (
                <article className="admin-row" key={category.id}>
                  {editingCategoryId === category.id ? (
                    <form
                      className="category-edit-form"
                      onSubmit={(event) => void saveCategory(event, category)}
                    >
                      <div className="category-edit-fields">
                        <label>
                          <span>Nome visibile</span>
                          <input
                            autoFocus
                            name="name"
                            defaultValue={category.name}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label>
                          <span>Slug interno</span>
                          <input
                            name="slug"
                            defaultValue={category.slug}
                            maxLength={120}
                            required
                          />
                        </label>
                        <small>
                          Lo slug può influenzare colori, stampa e regole speciali.
                        </small>
                      </div>
                      <div className="row-actions category-edit-actions">
                        <button type="submit">Salva</button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                        >
                          Annulla
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div><strong>{category.name}</strong><small>/{category.slug}</small></div>
                      <div className="row-actions category-row-actions">
                        <button type="button" disabled={index === 0} onClick={() => void moveCategory(category, -1)}>↑</button>
                        <button type="button" disabled={index === categories.length - 1} onClick={() => void moveCategory(category, 1)}>↓</button>
                        <button type="button" onClick={() => void toggle("menu_categories", category.id, "active", !category.active)}>
                          {category.active ? "Attiva" : "Spenta"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(category.id)}
                        >
                          Modifica
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="admin-panel admin-products-panel">
            <div className="panel-title"><div><p className="eyebrow">Catalogo</p><h2>Prodotti</h2></div><strong>{items.length}</strong></div>
            <form className="product-create" onSubmit={createProduct}>
              <select name="category_id" required>
                <option value="">Categoria</option>
                {categories.filter((category) => category.slug !== "extra").map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
              <input name="name" placeholder="Nome prodotto" maxLength={120} required />
              <input name="price" type="number" min="0" step="0.01" placeholder="Prezzo" required />
              <select name="preparation_area" defaultValue="cucina">
                <option value="pizzeria">Pizzeria</option><option value="cucina">Cucina</option>
                <option value="bar">Bar</option><option value="cassa">Cassa</option>
              </select>
              <button className="button button-primary">{saving ? "Salvataggio…" : "Crea prodotto"}</button>
            </form>
            <div className="admin-list product-admin-list">
              {categories.filter((category) => category.slug !== "extra").map((category) => {
                const categoryItems = items.filter(
                  (item) => item.category_id === category.id,
                );
                return (
                  <section key={category.id}>
                    <h3 className="admin-group-title">{category.name}</h3>
                    {categoryItems.map((item, index) => (
                      <form
                        className={`product-admin-row ${
                          productDropTarget?.itemId === item.id
                            ? `drop-${productDropTarget.placement}`
                            : ""
                        }`}
                        key={item.id}
                        onDragOver={(event) =>
                          handleProductDragOver(event, category.id, item.id)
                        }
                        onDrop={(event) =>
                          void handleProductDrop(event, category.id, item.id)
                        }
                        onSubmit={(event) => void saveProduct(event, item.id)}
                      >
                      <button
                        aria-label={`Trascina ${item.name}`}
                        className="product-drag-handle"
                        draggable
                        onDragEnd={clearProductDrag}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                          setDraggedProduct({
                            categoryId: category.id,
                            itemId: item.id,
                          });
                        }}
                        title="Trascina per riordinare"
                        type="button"
                      >
                        ⠿
                      </button>
                      <input name="name" defaultValue={item.name} maxLength={120} aria-label="Nome" />
                      <input name="price" type="number" min="0" step="0.01" defaultValue={item.price} aria-label="Prezzo" />
                      <input name="ingredients" defaultValue={item.ingredients ?? ""} maxLength={500} placeholder="Ingredienti" aria-label="Ingredienti" />
                      <select name="preparation_area" defaultValue={item.preparation_area} aria-label="Reparto">
                        <option value="pizzeria">Pizzeria</option><option value="cucina">Cucina</option>
                        <option value="bar">Bar</option><option value="cassa">Cassa</option>
                      </select>
                      <label className="check-label"><input name="available" type="checkbox" defaultChecked={item.available} /> Disponibile</label>
                      <label className="check-label"><input name="visible_public" type="checkbox" defaultChecked={item.visible_public} /> QR</label>
                      <label className="check-label"><input name="visible_staff" type="checkbox" defaultChecked={item.visible_staff} /> Staff</label>
                      <div className="product-order-actions">
                        <button
                          disabled={index === 0}
                          onClick={() =>
                            void moveProduct(
                              category.id,
                              item.id,
                              categoryItems[index - 1]?.id,
                              "before",
                            )
                          }
                          type="button"
                        >
                          Sposta su
                        </button>
                        <button
                          disabled={index === categoryItems.length - 1}
                          onClick={() =>
                            void moveProduct(
                              category.id,
                              item.id,
                              categoryItems[index + 1]?.id,
                              "after",
                            )
                          }
                          type="button"
                        >
                          Sposta giù
                        </button>
                      </div>
                      <button className="button button-secondary">{saving ? "Salvataggio…" : "Salva"}</button>
                      </form>
                    ))}
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "extras" && (
        <section className="admin-panel">
          <div className="panel-title"><div><p className="eyebrow">Aggiunte</p><h2>Extra</h2></div></div>
          <form className="inline-create" onSubmit={createExtra}>
            <input name="name" placeholder="Nome extra" maxLength={120} required />
            <input name="price" type="number" min="0" step="0.01" placeholder="Prezzo" required />
            <button className="button button-primary">{saving ? "Salvataggio…" : "Aggiungi"}</button>
          </form>
          <div className="admin-list">
            {extras.map((extra) => (
              <article className="admin-row" key={extra.id}>
                <div><strong>{extra.name}</strong><small>{formatCurrency(extra.price)}</small></div>
                <button onClick={() => void toggle("menu_extras", extra.id, "available", !extra.available)}>
                  {extra.available ? "Disponibile" : "Esaurito"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "tables" && (
        <section className="admin-panel">
          <div className="panel-title"><div><p className="eyebrow">Sala</p><h2>Tavoli</h2></div><strong>{tables.length}</strong></div>
          <form className="inline-create" onSubmit={createTable}>
            <input name="table_number" type="number" min="1" placeholder="Numero" required />
            <input name="display_name" placeholder="Nome opzionale" />
            <button className="button button-primary">{saving ? "Salvataggio…" : "Aggiungi"}</button>
          </form>
          <div className="admin-list table-admin-list">
            {tables.map((table) => (
              <article className="admin-row" key={table.id}>
                <div><strong>Tavolo {table.table_number}</strong><small>{table.display_name || "—"}</small></div>
                <button onClick={() => void toggle("restaurant_tables", table.id, "active", !table.active)}>
                  {table.active ? "Attivo" : "Disattivato"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "settings" && settings && (
        <form className="admin-panel settings-form" onSubmit={saveSettings}>
          <div className="panel-title"><div><p className="eyebrow">Locale</p><h2>Impostazioni</h2></div></div>
          <label>Nome locale<input name="restaurant_name" defaultValue={settings.restaurant_name} required /></label>
          <label>Coperto<input name="cover_charge" type="number" min="0" step="0.01" defaultValue={settings.cover_charge} required /></label>
          <label className="settings-switch">
            <span className="settings-switch-copy">
              <strong>Servizio pranzo</strong>
              <small>
                Mostra il pranzo tra i turni che la Cassa può avviare e nei filtri
                delle statistiche.
              </small>
            </span>
            <span className="settings-switch-control">
              <input
                defaultChecked={settings.lunch_service_enabled}
                name="lunch_service_enabled"
                type="checkbox"
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <label className="settings-switch">
            <span className="settings-switch-copy">
              <strong>Tavoli attivi per primi</strong>
              <small>
                Sposta in cima i tavoli con una comanda aperta. Se disattivato,
                resta il normale ordine numerico.
              </small>
            </span>
            <span className="settings-switch-control">
              <input
                defaultChecked={settings.sort_active_tables_first}
                name="sort_active_tables_first"
                type="checkbox"
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <div className="department-print-setting">
            <div>
              <strong>Tipo comande</strong>
              <p>Decide cosa esce quando viene stampata una comanda operativa.</p>
            </div>
            <div className="print-mode-options">
              {([
                [
                  "department_split",
                  "Tre copie diverse",
                  "Pizzeria, cucina e completa/cassa nello stesso invio.",
                ],
                [
                  "legacy_three_copies",
                  "Tre copie identiche",
                  "Mantiene la stampa precedente con lo stesso foglio ripetuto.",
                ],
              ] as [OrderTicketPrintMode, string, string][]).map(
                ([value, label, description]) => (
                  <label className="print-mode-option" key={value}>
                    <input
                      checked={printModePreview === value}
                      name="order_ticket_print_mode"
                      onChange={() => setPrintModePreview(value)}
                      type="radio"
                      value={value}
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </label>
                ),
              )}
            </div>
            <p className="settings-print-preview-note">
              Lo schema qui sotto è indicativo. “Stampa browser” simula invece
              l’uscita ESC/POS effettivamente inviata a PrintNode.
            </p>
            <PrintModePreview mode={printModePreview} />
            <div className="print-test-actions">
              <button
                className="button button-secondary"
                disabled={!canWrite || testPrinting}
                onClick={() => void requestTestPrint()}
                type="button"
              >
                {testPrinting ? "Invio prova…" : "Prova stampa comanda"}
              </button>
              <button
                className="button button-secondary"
                onClick={openBrowserTestPrint}
                type="button"
              >
                Stampa browser
              </button>
            </div>
          </div>
          <label>Avviso allergeni<textarea name="allergen_notice" defaultValue={settings.allergen_notice ?? ""} /></label>
          <label>Testo finale ticket<textarea name="ticket_footer" defaultValue={settings.ticket_footer ?? ""} /></label>
          <button className="button button-primary">
            {saving ? "Salvataggio…" : "Salva impostazioni"}
          </button>
        </form>
      )}
      </fieldset>
    </>
  );

  async function execute(task: () => Promise<{ error: { message: string } | null }>) {
    if (!canWrite) {
      setFeedback({
        text: blockReason ?? "Connessione non verificata. Modifica non eseguita.",
        type: "error",
      });
      return false;
    }
    setSaving(true);
    try {
      const { error } = await task();
      if (
        error &&
        (!("code" in error) || !String((error as { code?: string }).code ?? ""))
      ) {
        markUnreliable();
      }
      setFeedback({
        text: error ? error.message : "Salvato",
        type: error ? "error" : "success",
      });
      if (!error) await load();
      return !error;
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const slug = normalizeCategorySlug(String(data.get("slug")));
    if (!name || !slug) {
      setFeedback({
        text: "Nome e slug della categoria sono obbligatori",
        type: "error",
      });
      return;
    }
    const saved = await execute(() => createClient().from("menu_categories").insert({
      name,
      slug,
      sort_order: categories.length,
    }));
    if (saved) form.reset();
  }

  async function saveCategory(
    event: React.FormEvent<HTMLFormElement>,
    category: MenuCategory,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const slug = normalizeCategorySlug(String(data.get("slug")));
    if (!name || !slug) {
      setFeedback({
        text: "Nome e slug della categoria sono obbligatori",
        type: "error",
      });
      return;
    }
    if (
      slug !== category.slug &&
      !window.confirm(
        "Lo slug è usato da colori, stampa e regole speciali. Confermi la modifica?",
      )
    ) {
      return;
    }

    const saved = await execute(async () => {
      const result = await createClient()
        .from("menu_categories")
        .update({
          name,
          name_en: name === category.name ? category.name_en : null,
          slug,
        })
        .eq("id", category.id);
      if (result.error?.code === "23505") {
        return { error: { message: "Questo slug è già usato da un’altra categoria" } };
      }
      return result;
    });
    if (saved) setEditingCategoryId(null);
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const categoryId = String(data.get("category_id"));
    await execute(() => createClient().from("menu_items").insert({
      category_id: categoryId,
      name: String(data.get("name")),
      price: Number(data.get("price")),
      preparation_area: String(data.get("preparation_area")) as PreparationArea,
      sort_order: items.filter((item) => item.category_id === categoryId).length,
    }));
    form.reset();
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = items.find((item) => item.id === id);
    const name = String(data.get("name"));
    const ingredients = String(data.get("ingredients")) || null;
    await execute(() => createClient().from("menu_items").update({
      name,
      name_en: current && name === current.name ? current.name_en : null,
      price: Number(data.get("price")),
      ingredients,
      ingredients_en:
        current && ingredients === current.ingredients ? current.ingredients_en : null,
      preparation_area: String(data.get("preparation_area")) as PreparationArea,
      available: data.get("available") === "on",
      visible_public: data.get("visible_public") === "on",
      visible_staff: data.get("visible_staff") === "on",
    }).eq("id", id));
  }

  async function createExtra(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const extraCategory = categories.find((category) => category.slug === "extra");
    await execute(() => createClient().from("menu_extras").insert({
      category_id: extraCategory?.id ?? null,
      name: String(data.get("name")),
      price: Number(data.get("price")),
      sort_order: extras.length,
    }));
    form.reset();
  }

  async function createTable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await execute(() => createClient().from("restaurant_tables").insert({
      table_number: Number(data.get("table_number")),
      display_name: String(data.get("display_name")) || null,
    }));
    form.reset();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await execute(() => createClient().from("restaurant_settings").update({
      restaurant_name: String(data.get("restaurant_name")),
      cover_charge: Number(data.get("cover_charge")),
      lunch_service_enabled: data.has("lunch_service_enabled"),
      sort_active_tables_first: data.has("sort_active_tables_first"),
      allergen_notice: String(data.get("allergen_notice")) || null,
      ticket_footer: String(data.get("ticket_footer")) || null,
      order_ticket_print_mode: normalizePrintMode(
        data.get("order_ticket_print_mode"),
      ),
    }).eq("id", settings!.id));
  }

  async function requestTestPrint() {
    if (!canWrite) {
      setFeedback({
        text: blockReason ?? "Connessione non verificata. Prova non eseguita.",
        type: "error",
      });
      return;
    }

    setTestPrinting(true);
    try {
      const response = await fetch("/api/print-test-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: printModePreview }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        printNodeJobId?: number;
      };

      setFeedback({
        text: response.ok
          ? `Prova inviata alla stampante${payload.printNodeJobId ? ` #${payload.printNodeJobId}` : ""}`
          : payload.error ?? "Prova di stampa non riuscita",
        type: response.ok ? "success" : "error",
      });
    } catch {
      markUnreliable();
      setFeedback({
        text: "Connessione non affidabile. Prova di stampa non inviata.",
        type: "error",
      });
    } finally {
      setTestPrinting(false);
    }
  }

  function openBrowserTestPrint() {
    const query = new URLSearchParams({
      autoprint: "1",
      mode: printModePreview,
    });
    window.open(`/admin/print-test?${query.toString()}`, "_blank", "noopener");
  }

  async function moveCategory(category: MenuCategory, delta: number) {
    if (!canWrite) {
      setFeedback({
        text: blockReason ?? "Connessione non verificata. Modifica non eseguita.",
        type: "error",
      });
      return;
    }
    const currentIndex = categories.findIndex((entry) => entry.id === category.id);
    const other = categories[currentIndex + delta];
    if (!other) return;
    const reordered = [...categories];
    [reordered[currentIndex], reordered[currentIndex + delta]] = [
      reordered[currentIndex + delta],
      reordered[currentIndex],
    ];
    const { error } = await createClient().rpc("reorder_menu_categories", {
      p_category_ids: reordered.map((entry) => entry.id),
    });
    if (error && !error.code) markUnreliable();
    setFeedback({
      text: error ? error.message : "Salvato",
      type: error ? "error" : "success",
    });
    if (!error) await load();
  }

  function handleProductDragOver(
    event: React.DragEvent<HTMLFormElement>,
    categoryId: string,
    itemId: string,
  ) {
    if (
      !draggedProduct ||
      draggedProduct.categoryId !== categoryId ||
      draggedProduct.itemId === itemId
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setProductDropTarget({ itemId, placement });
  }

  async function handleProductDrop(
    event: React.DragEvent<HTMLFormElement>,
    categoryId: string,
    itemId: string,
  ) {
    if (!draggedProduct || draggedProduct.categoryId !== categoryId) return;
    event.preventDefault();
    const placement =
      productDropTarget?.itemId === itemId
        ? productDropTarget.placement
        : "before";
    const movedItemId = draggedProduct.itemId;
    clearProductDrag();
    await moveProduct(categoryId, movedItemId, itemId, placement);
  }

  function clearProductDrag() {
    setDraggedProduct(null);
    setProductDropTarget(null);
  }

  async function moveProduct(
    categoryId: string,
    movedItemId: string,
    targetItemId: string | undefined,
    placement: DropPlacement,
  ) {
    if (!targetItemId || saving) return;
    if (!canWrite) {
      setFeedback({
        text: blockReason ?? "Connessione non verificata. Modifica non eseguita.",
        type: "error",
      });
      return;
    }

    const categoryItems = items.filter(
      (item) => item.category_id === categoryId,
    );
    const reordered = reorderCategoryMenuItems(
      categoryItems,
      movedItemId,
      targetItemId,
      placement,
    );
    if (reordered === categoryItems) return;

    const previousItems = items;
    setItems(replaceCategoryItems(items, categoryId, reordered));
    setSaving(true);
    try {
      const { error } = await createClient().rpc("reorder_menu_items", {
        p_category_id: categoryId,
        p_item_ids: reordered.map((item) => item.id),
      });
      if (error) {
        if (!error.code) markUnreliable();
        setItems(previousItems);
        setFeedback({ text: error.message, type: "error" });
        return;
      }
      setFeedback({ text: "Ordine prodotti salvato", type: "success" });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(table: string, id: string, field: string, value: boolean) {
    await execute(() => createClient().from(table).update({ [field]: value }).eq("id", id));
  }
}

function normalizePrintMode(value: FormDataEntryValue | null): OrderTicketPrintMode {
  return value === "legacy_three_copies"
    ? "legacy_three_copies"
    : "department_split";
}

function PrintModePreview({ mode }: { mode: OrderTicketPrintMode }) {
  if (mode === "legacy_three_copies") {
    return (
      <div className="settings-ticket-preview">
        {["COPIA 1", "COPIA 2", "COPIA 3"].map((copy) => (
          <pre key={copy}>{`${copy}
NUOVA COMANDA
COMANDA #42
TAVOLO 12

PINSE ROSSE
1x R Diavola
  + mozzarella
  Nota: senza piccante
6x AYCE Adulti

ANTIPASTI E FRITTI
1 Suppli

Tavolo: 12
Orario ordine: 21:35`}</pre>
        ))}
      </div>
    );
  }

  return (
    <div className="settings-ticket-preview">
      <pre>{`COPIA PIZZERIA
NUOVA COMANDA
COMANDA #42

1R Diavola
  + mozzarella
  Nota: senza piccante
1B Boscaiola
6 AYCE Adulti

Tavolo: 12
Orario ordine: 21:35`}</pre>
      <pre>{`COPIA CUCINA
NUOVA COMANDA
COMANDA #42

6 AYCE Adulti
1 Suppli
1 Carbonara
1 Contorno verdure

Tavolo: 12
Orario ordine: 21:35`}</pre>
      <pre>{`COPIA COMPLETA / CASSA
NUOVA COMANDA
COMANDA #42

1R Diavola
1B Boscaiola
6 AYCE Adulti
1 Suppli
1 Carbonara
1 Contorno verdure
1 Acqua

Tavolo: 12
Orario ordine: 21:35`}</pre>
    </div>
  );
}

function replaceCategoryItems(
  items: MenuItem[],
  categoryId: string,
  reordered: MenuItem[],
) {
  let categoryIndex = 0;
  return items.map((item) =>
    item.category_id === categoryId
      ? reordered[categoryIndex++]
      : item,
  );
}
