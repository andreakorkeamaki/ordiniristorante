"use client";

import Image from "next/image";
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
        <div className="menu-hero-inner">
          <div className="menu-hero-top">
            <div
              className="menu-brand-lockup"
              role="img"
              aria-label="La Sagretta, tavola calda, pinsa romana e cucina casareccia"
            />
            <button
              className="language-toggle"
              type="button"
              onClick={() => setLanguage((current) => (current === "it" ? "en" : "it"))}
              aria-label="Cambia lingua"
            >
              {language === "it" ? "IT · EN" : "EN · IT"}
            </button>
          </div>

          <div className="menu-hero-main">
            <div className="menu-hero-copy">
              <p className="menu-poster-label">
                {language === "en" ? "Digital menu" : "Il menu digitale"}
              </p>
              <h1>
                {language === "en" ? "The taste of home." : "Il gusto di casa."}
              </h1>
              <p>
                {language === "en"
                  ? "Roman pinsa, hot dishes and homemade cooking, prepared with care every day."
                  : "Pinsa romana, tavola calda e cucina casareccia, preparate con cura ogni giorno."}
              </p>

              <label className="menu-search">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={language === "it" ? "Cerca nel menu" : "Search the menu"}
                />
              </label>
            </div>

            <div className="menu-hero-food" aria-hidden="true">
              <span className="menu-hero-burst">Fatta con cura</span>
              <Image
                src="/images/la-sagretta-pinsa.png"
                alt=""
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 700px) 110vw, 48vw"
              />
            </div>
          </div>
        </div>
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
            <section
              className={`menu-category menu-category-${categoryTone(category.slug)}`}
              id={`category-${category.slug}`}
              key={category.id}
            >
              <div className="section-heading">
                <div className="section-heading-copy">
                  <span className="section-number">
                    — {String(category.sort_order + 1).padStart(2, "0")} —
                  </span>
                  <h2>{translated(category.name, category.name_en, language)}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>
                <CategoryArtwork slug={category.slug} />
              </div>
              <div className="public-products">
                {items.map((item) => (
                  <MenuProduct item={item} language={language} key={item.id} />
                ))}
                {extras.map((extra) => (
                  <article className="public-product" key={extra.id}>
                    <div className="product-title-line">
                      <h3>{extra.name}</h3>
                      <span className="product-leader" aria-hidden="true" />
                    </div>
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
        <div className="menu-footer-brand" aria-hidden="true" />
        <div>
          <strong>{data.settings.restaurant_name}</strong>
          <p>Il gusto di casa, ogni giorno.</p>
        </div>
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
          <span className="product-leader" aria-hidden="true" />
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

function CategoryArtwork({ slug }: { slug: string }) {
  if (slug === "antipasti") {
    return (
      <Image
        className="category-artwork category-artwork-antipasti"
        src="/images/la-sagretta-antipasti.png"
        alt="Tagliere di antipasti della casa"
        width={1536}
        height={1024}
        sizes="(max-width: 700px) 70vw, 24rem"
      />
    );
  }

  if (slug === "rosse") {
    return (
      <Image
        className="category-artwork category-artwork-pinsa"
        src="/images/la-sagretta-pinsa.png"
        alt="Pinsa rossa con mozzarella, pomodorini e basilico"
        width={1536}
        height={1024}
        sizes="(max-width: 700px) 70vw, 23rem"
      />
    );
  }

  return null;
}

function categoryTone(slug: string) {
  if (["bianche", "all-you-can-eat", "bimbi", "bevande"].includes(slug)) return "green";
  if (["speciali", "sapori-mare"].includes(slug)) return "blue";
  return "red";
}

function translated(italian: string | null, english: string | null, language: "it" | "en") {
  return language === "en" && english ? english : italian ?? "";
}
