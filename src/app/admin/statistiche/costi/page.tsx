import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import type { CostCatalogEntry } from "@/lib/admin-analytics";
import { loadCostCatalog } from "@/lib/admin-analytics-server";
import { requireProfile } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { saveProductCost } from "./actions";

export const metadata: Metadata = { title: "Costi prodotti" };
export const dynamic = "force-dynamic";

export default async function ProductCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const profile = await requireProfile(["admin"]);
  const [result, params] = await Promise.all([loadCostCatalog(), searchParams]);

  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace analytics-workspace">
        <section className="workspace-heading analytics-heading">
          <div>
            <p className="eyebrow">Statistiche</p>
            <h1>Costi prodotti</h1>
            <p>
              Il costo viene salvato su ogni nuova vendita e non cambia lo storico.
              Lascia vuoto un campo se il costo non è noto.
            </p>
          </div>
          <Link className="button button-secondary" href="/admin/statistiche">
            Torna alla dashboard
          </Link>
        </section>

        {params.saved === "1" && (
          <p className="connection-action-hint is-success" role="status">
            Costo salvato. Le nuove vendite useranno questo valore.
          </p>
        )}
        {params.error && (
          <p className="connection-action-hint" role="alert">
            Costo non salvato. Controlla il valore e riprova.
          </p>
        )}

        {result.error || !result.data ? (
          <section className="connection-action-hint" role="alert">
            <strong>Costi non disponibili.</strong>{" "}
            {result.error ?? "Non è stato possibile leggere il catalogo."}
          </section>
        ) : (
          <CostCatalogTable items={[...result.data.items, ...result.data.extras]} />
        )}
      </main>
    </>
  );
}

function CostCatalogTable({ items }: { items: CostCatalogEntry[] }) {
  const configured = items.filter((item) => item.unit_cost !== null).length;
  const groups = items.reduce<Map<string, CostCatalogEntry[]>>((result, item) => {
    const entries = result.get(item.category) ?? [];
    entries.push(item);
    result.set(item.category, entries);
    return result;
  }, new Map());

  return (
    <>
      <section className="cost-catalog-summary">
        <strong>{configured} di {items.length} costi configurati</strong>
        <span>Il margine diventa definitivo solo quando tutte le vendite del periodo hanno un costo fotografato.</span>
      </section>
      <div className="cost-catalog-groups">
        {[...groups.entries()].map(([category, entries]) => (
          <section className="analytics-panel cost-catalog-panel" key={category}>
            <div className="analytics-panel-heading">
              <h2>{category}</h2>
              <span>{entries.length} prodotti</span>
            </div>
            <div className="cost-catalog-list">
              {entries.map((item) => <CostRow item={item} key={item.id} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function CostRow({ item }: { item: CostCatalogEntry }) {
  const estimatedMargin = item.unit_cost === null ? null : item.price - item.unit_cost;
  const isExtra = item.category === "Extra";
  return (
    <form className={`cost-catalog-row ${item.active ? "" : "is-inactive"}`} action={saveProductCost}>
      <input name="kind" type="hidden" value={isExtra ? "extra" : "item"} />
      <input name="product_id" type="hidden" value={item.id} />
      <div className="cost-product-name">
        <strong>{item.name}</strong>
        <small>{item.active ? "Attivo" : "Non attivo"}</small>
      </div>
      <div className="cost-sale-price">
        <span>Prezzo</span>
        <strong>{formatCurrency(item.price)}</strong>
      </div>
      <label>
        <span>Costo unitario</span>
        <input
          name="unit_cost"
          type="number"
          min="0"
          max="999999.99"
          step="0.01"
          defaultValue={item.unit_cost ?? ""}
          placeholder="Non noto"
        />
      </label>
      <div className="cost-margin-preview">
        <span>Margine unitario</span>
        <strong>{estimatedMargin === null ? "—" : formatCurrency(estimatedMargin)}</strong>
      </div>
      <button className="button button-secondary" type="submit">Salva</button>
    </form>
  );
}
