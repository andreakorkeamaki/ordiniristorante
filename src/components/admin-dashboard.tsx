"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
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

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("menu");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuExtra[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [categoryResult, itemResult, extraResult, tableResult, settingsResult] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
      supabase.from("menu_extras").select("*").order("sort_order"),
      supabase.from("restaurant_tables").select("*").order("table_number"),
      supabase.from("restaurant_settings").select("*").limit(1).maybeSingle(),
    ]);
    setCategories((categoryResult.data ?? []) as MenuCategory[]);
    setItems((itemResult.data ?? []) as MenuItem[]);
    setExtras((extraResult.data ?? []) as MenuExtra[]);
    setTables((tableResult.data ?? []) as RestaurantTable[]);
    setSettings(settingsResult.data as RestaurantSettings | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (loading) return <div className="loader" aria-label="Caricamento amministrazione" />;

  return (
    <>
      <section className="workspace-heading">
        <div><p className="eyebrow">Configurazione</p><h1>Amministrazione</h1><p>Le modifiche al menu vengono pubblicate in tempo reale.</p></div>
      </section>
      {message && <button className="external-update" onClick={() => setMessage("")}>{message} · Chiudi</button>}
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

      {tab === "menu" && (
        <div className="admin-grid">
          <section className="admin-panel">
            <div className="panel-title"><div><p className="eyebrow">Struttura</p><h2>Categorie</h2></div></div>
            <form className="inline-create" onSubmit={createCategory}>
              <input name="name" placeholder="Nuova categoria" required />
              <input name="slug" placeholder="slug" required />
              <button className="button button-primary">Aggiungi</button>
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
              <button className="button button-primary">Crea prodotto</button>
            </form>
            <div className="admin-list product-admin-list">
              {categories.filter((category) => category.slug !== "extra").map((category) => (
                <section key={category.id}>
                  <h3 className="admin-group-title">{category.name}</h3>
                  {items.filter((item) => item.category_id === category.id).map((item) => (
                    <form className="product-admin-row" key={item.id} onSubmit={(event) => void saveProduct(event, item.id)}>
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
                      <button className="button button-secondary">Salva</button>
                    </form>
                  ))}
                </section>
              ))}
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
            <button className="button button-primary">Aggiungi</button>
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
            <button className="button button-primary">Aggiungi</button>
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
          <label>Copie di stampa<input name="default_print_copies" type="number" min="1" max="10" defaultValue={settings.default_print_copies} required /></label>
          <label>Avviso allergeni<textarea name="allergen_notice" defaultValue={settings.allergen_notice ?? ""} /></label>
          <label>Testo finale ticket<textarea name="ticket_footer" defaultValue={settings.ticket_footer ?? ""} /></label>
          <button className="button button-primary">Salva impostazioni</button>
        </form>
      )}
    </>
  );

  async function execute(task: () => Promise<{ error: { message: string } | null }>) {
    const { error } = await task();
    setMessage(error ? error.message : "Modifica salvata");
    if (!error) await load();
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
    await execute(() => createClient().from("menu_items").update({
      name: String(data.get("name")),
      price: Number(data.get("price")),
      ingredients: String(data.get("ingredients")) || null,
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
      default_print_copies: Number(data.get("default_print_copies")),
      allergen_notice: String(data.get("allergen_notice")) || null,
      ticket_footer: String(data.get("ticket_footer")) || null,
    }).eq("id", settings!.id));
  }

  async function moveCategory(category: MenuCategory, delta: number) {
    const currentIndex = categories.findIndex((entry) => entry.id === category.id);
    const other = categories[currentIndex + delta];
    if (!other) return;
    const supabase = createClient();
    const first = await supabase.from("menu_categories").update({ sort_order: other.sort_order }).eq("id", category.id);
    if (first.error) return setMessage(first.error.message);
    const second = await supabase.from("menu_categories").update({ sort_order: category.sort_order }).eq("id", other.id);
    setMessage(second.error ? second.error.message : "Ordine categorie aggiornato");
    if (!second.error) await load();
  }

  async function toggle(table: string, id: string, field: string, value: boolean) {
    await execute(() => createClient().from(table).update({ [field]: value }).eq("id", id));
  }
}
