"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { MenuCategory, MenuData, MenuExtra, MenuItem, RestaurantSettings } from "@/types/domain";

const EMPTY_MENU: MenuData = {
  settings: { ...DEFAULT_SETTINGS },
  categories: [],
  items: [],
  extras: [],
};

export function PublicMenu() {
  const [data, setData] = useState<MenuData>(EMPTY_MENU);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"it" | "en">("it");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [settings, categories, items, extras] = await Promise.all([
      supabase.from("restaurant_settings").select("*").limit(1).maybeSingle(),
      supabase.from("menu_categories").select("*").eq("active", true).order("sort_order"),
      supabase
        .from("menu_items")
        .select("*")
        .eq("active", true)
        .eq("available", true)
        .eq("visible_public", true)
        .order("sort_order"),
      supabase
        .from("menu_extras")
        .select("*")
        .eq("active", true)
        .eq("available", true)
        .eq("visible_public", true)
        .order("sort_order"),
    ]);

    const firstError = settings.error ?? categories.error ?? items.error ?? extras.error;
    if (firstError) {
      setError("Menu non disponibile. Riprova tra poco.");
      setLoading(false);
      return;
    }

    setData({
      settings: (settings.data as RestaurantSettings | null) ?? { ...DEFAULT_SETTINGS },
      categories: (categories.data ?? []) as MenuCategory[],
      items: (items.data ?? []) as MenuItem[],
      extras: (extras.data ?? []) as MenuExtra[],
    });
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    const channel = supabase
      .channel("public-menu")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_extras" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_settings" }, load)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    if (!needle) return data.items;
    return data.items.filter((item) =>
      [item.name, item.name_en, item.description, item.ingredients, ...item.allergens]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("it").includes(needle)),
    );
  }, [data.items, query]);

  if (loading) return <div className="loader menu-loader" aria-label="Caricamento menu" />;

  return (
    <>
      <header className="menu-hero">
        <div className="menu-hero-top">
          <span className="brand-mark brand-mark-large">LS</span>
          <button
            className="language-toggle"
            type="button"
            onClick={() => setLanguage((current) => (current === "it" ? "en" : "it"))}
            aria-label="Cambia lingua"
          >
            {language === "it" ? "IT · EN" : "EN · IT"}
          </button>
        </div>
        <p className="eyebrow">Pinsa · Cucina · Mare</p>
        <h1>{data.settings.restaurant_name}</h1>
        <p>
          {language === "en"
            ? "Our menu, prepared with care. English translations are being completed."
            : "Il nostro menu, preparato con cura. Chiedi al personale per ogni esigenza."}
        </p>
        <label className="menu-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language === "it" ? "Cerca nel menu" : "Search the menu"}
          />
        </label>
      </header>

      {error && <p className="form-error menu-error">{error}</p>}

      {!query && (
        <nav className="category-strip" aria-label="Categorie">
          {data.categories.map((category) => (
            <a href={`#category-${category.slug}`} key={category.id}>
              {translated(category.name, category.name_en, language)}
            </a>
          ))}
        </nav>
      )}

      <div className="menu-content">
        {data.categories.map((category) => {
          const items = filtered.filter((item) => item.category_id === category.id);
          const extras = query ? [] : data.extras.filter((extra) => extra.category_id === category.id);
          if (!items.length && !extras.length) return null;

          return (
            <section className="menu-category" id={`category-${category.slug}`} key={category.id}>
              <div className="section-heading">
                <span>{String(category.sort_order + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{translated(category.name, category.name_en, language)}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>
              </div>
              <div className="public-products">
                {items.map((item) => (
                  <MenuProduct item={item} language={language} key={item.id} />
                ))}
                {extras.map((extra) => (
                  <article className="public-product" key={extra.id}>
                    <div><h3>{extra.name}</h3></div>
                    <strong>{formatCurrency(extra.price)}</strong>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        {!filtered.length && query && (
          <section className="empty-card">
            <h2>Nessun risultato</h2>
            <p>Prova con un nome o un ingrediente diverso.</p>
          </section>
        )}
        {data.settings.allergen_notice && (
          <aside className="allergen-notice">
            <strong>Allergeni</strong>
            <p>{data.settings.allergen_notice}</p>
          </aside>
        )}
      </div>

      <footer className="menu-footer">
        <span className="brand-mark">LS</span>
        <p>La Sagretta · Menu digitale</p>
      </footer>
    </>
  );
}

function MenuProduct({ item, language }: { item: MenuItem; language: "it" | "en" }) {
  const name = translated(item.name, item.name_en, language);
  const ingredients = translated(item.ingredients, item.ingredients_en, language);
  const description = translated(item.description, item.description_en, language);

  return (
    <article className="public-product">
      <div>
        <div className="product-title-line">
          <h3>{name}</h3>
          <div className="product-tags">
            {item.vegan && <span>Vegan</span>}
            {!item.vegan && item.vegetarian && <span>Veg</span>}
          </div>
        </div>
        {ingredients && <p>{ingredients}</p>}
        {description && description !== ingredients && <p className="muted">{description}</p>}
        {item.allergens.length > 0 && (
          <small>Allergeni: {item.allergens.join(", ")}</small>
        )}
      </div>
      <strong>{formatCurrency(item.price)}</strong>
    </article>
  );
}

function translated(italian: string | null, english: string | null, language: "it" | "en") {
  return language === "en" && english ? english : italian ?? "";
}
