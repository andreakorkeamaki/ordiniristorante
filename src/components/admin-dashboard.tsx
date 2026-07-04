"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { formatCurrency } from "@/lib/format";
import {
  reorderCategoryMenuItems,
  type DropPlacement,
} from "@/lib/menu-ordering";
import { createClient } from "@/lib/supabase/client";
import type {
  MenuCategory,
  MenuExtra,
  MenuItem,
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
  const { canWrite, blockReason, markUnreliable } = useConnection();
  const [tab, setTab] = useState<Tab>("menu");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedProduct, setDraggedProduct] = useState<{
    categoryId: string;
    itemId: string;
  } | null>(null);
  const [productDropTarget, setProductDropTarget] =
    useState<ProductDropTarget | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
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
      supabase.from("restaurant_settings").select("*").limit(1).maybeSingle(),
    ]);
    const error =
      categoryResult.error ??
      itemResult.error ??
      extraResult.error ??
      tableResult.error ??
      settingsResult.error;
    if (error) {
      if (!error.code) markUnreliable();
      setLoading(false);
      return;
    }
    setCategories((categoryResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setTables((tableResult.data ?? []) as RestaurantTable[]);
    setSettings(settingsResult.data as RestaurantSettings | null);
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

  if (loading) return <div className="loader" aria-label="Caricamento amministrazione" />;

  return (
    <>
      <section className="workspace-heading">
        <div><p className="eyebrow">Configurazione</p><h1>Amministrazione</h1><p>Le modifiche al menu vengono pubblicate in tempo reale.</p></div>
      </section>
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
              <input name="name" placeholder="Nuova categoria" required />
              <input name="slug" placeholder="slug" required />
              <button className="button button-primary">{saving ? "Salvataggio…" : "Aggiungi"}</button>
            </form>
            <div className="admin-list">
              {categories.map((category, index) => (
                <article className="admin-row" key={category.id}>
                  <div><strong>{category.name}</strong><small>/{category.slug}</small></div>
                  <div className="row-actions">
                    <button disabled={index === 0} onClick={() => void moveCategory(category, -1)}>↑</button>
                    <button disabled={index === categories.length - 1} onClick={() => void moveCategory(category, 1)}>↓</button>
                    <button onClick={() => void toggle("menu_categories", category.id, "active", !category.active)}>
                      {category.active ? "Attiva" : "Spenta"}
                    </button>
                  </div>
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
              <input name="name" placeholder="Nome prodotto" required />
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
                      <input name="name" defaultValue={item.name} aria-label="Nome" />
                      <input name="price" type="number" min="0" step="0.01" defaultValue={item.price} aria-label="Prezzo" />
                      <input name="ingredients" defaultValue={item.ingredients ?? ""} placeholder="Ingredienti" aria-label="Ingredienti" />
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
            <input name="name" placeholder="Nome extra" required />
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
          <div className="department-print-setting">
            <strong>Comande per reparto</strong>
            <p>
              La stampa genera automaticamente un foglio separato per ogni reparto
              coinvolto nell’ordine.
            </p>
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
      return;
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
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await execute(() => createClient().from("menu_categories").insert({
      name: String(data.get("name")),
      slug: String(data.get("slug")),
      sort_order: categories.length,
    }));
    form.reset();
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
      allergen_notice: String(data.get("allergen_notice")) || null,
      ticket_footer: String(data.get("ticket_footer")) || null,
    }).eq("id", settings!.id));
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
    const supabase = createClient();
    const first = await supabase.from("menu_categories").update({ sort_order: other.sort_order }).eq("id", category.id);
    if (first.error) {
      if (!first.error.code) markUnreliable();
      setFeedback({ text: first.error.message, type: "error" });
      return;
    }
    const second = await supabase.from("menu_categories").update({ sort_order: category.sort_order }).eq("id", other.id);
    if (second.error && !second.error.code) markUnreliable();
    setFeedback({
      text: second.error ? second.error.message : "Salvato",
      type: second.error ? "error" : "success",
    });
    if (!second.error) await load();
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
