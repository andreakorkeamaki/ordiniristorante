import Link from "next/link";
import type { CSSProperties } from "react";
import {
  businessDateToday,
  shiftIsoDate,
  type AdminAnalytics,
  type AnalyticsDailyEntry,
  type AnalyticsProductEntry,
  type AnalyticsRange,
  type AnalyticsServiceEntry,
} from "@/lib/admin-analytics";
import { formatCurrency } from "@/lib/format";
import type { ServicePeriod } from "@/types/domain";

export function AdminAnalyticsDashboard({
  analytics,
  error,
  range,
}: {
  analytics: AdminAnalytics | null;
  error: string | null;
  range: AnalyticsRange;
}) {
  const today = businessDateToday();

  return (
    <>
      <section className="workspace-heading analytics-heading">
        <div>
          <p className="eyebrow">Solo amministrazione</p>
          <h1>Statistiche</h1>
          <p>
            Vendite e andamento dei servizi dal {formatDate(range.from)} al{" "}
            {formatDate(range.to)}.
          </p>
        </div>
        <Link className="button button-secondary" href="/admin/statistiche/costi">
          Configura costi
        </Link>
      </section>

      <section className="analytics-filter-panel" aria-label="Filtri statistiche">
        <div className="analytics-presets" aria-label="Intervalli rapidi">
          <PresetLink days={7} label="7 giorni" period={range.period} today={today} />
          <PresetLink days={30} label="30 giorni" period={range.period} today={today} />
          <PresetLink days={90} label="90 giorni" period={range.period} today={today} />
          <Link
            className="analytics-preset"
            href={analyticsHref("2000-01-01", today, range.period)}
          >
            Tutto
          </Link>
        </div>
        <form className="analytics-filters">
          <label>
            <span>Dal</span>
            <input name="from" type="date" defaultValue={range.from} max={range.to} />
          </label>
          <label>
            <span>Al</span>
            <input name="to" type="date" defaultValue={range.to} min={range.from} />
          </label>
          <label>
            <span>Turno</span>
            <select name="period" defaultValue={range.period ?? "all"}>
              <option value="all">Tutti</option>
              <option value="pranzo">Pranzo</option>
              <option value="cena">Cena</option>
              <option value="recupero">Recupero</option>
            </select>
          </label>
          <button className="button button-primary" type="submit">
            Applica
          </button>
        </form>
      </section>

      {error || !analytics ? (
        <section className="connection-action-hint" role="alert">
          <strong>Dashboard non disponibile.</strong>{" "}
          {error ?? "Non è stato possibile leggere le statistiche."}
        </section>
      ) : (
        <AnalyticsContent analytics={analytics} />
      )}
    </>
  );
}

function AnalyticsContent({ analytics }: { analytics: AdminAnalytics }) {
  const { metrics } = analytics;
  const costComplete = metrics.cost_coverage === 100;

  if (metrics.service_count === 0) {
    return (
      <section className="empty-card analytics-empty">
        <p className="eyebrow">Nessun servizio</p>
        <h2>Nessun dato nell’intervallo</h2>
        <p>Prova ad ampliare le date o a selezionare tutti i turni.</p>
      </section>
    );
  }

  return (
    <>
      <section className="analytics-kpis" aria-label="Indicatori principali">
        <MetricCard label="Incasso" value={formatCurrency(metrics.revenue)} detail={`${metrics.service_count} servizi`} />
        <MetricCard label="Ordini chiusi" value={String(metrics.order_count)} detail={`${metrics.cancelled_count} annullati`} />
        <MetricCard label="Coperti" value={String(metrics.cover_count)} detail={`Media ${formatCurrency(metrics.average_cover)}`} />
        <MetricCard label="Ordine medio" value={formatCurrency(metrics.average_order)} detail="Su sala e asporto" />
        <MetricCard
          label="Costo registrato"
          value={formatCurrency(metrics.known_cost)}
          detail={`Copertura costi ${metrics.cost_coverage}%`}
          warning={!costComplete}
        />
        <MetricCard
          label="Margine lordo"
          value={metrics.gross_profit === null ? "Da completare" : formatCurrency(metrics.gross_profit)}
          detail={costComplete ? "Incasso meno costi prodotto" : "Mancano costi su parte delle vendite"}
          warning={!costComplete}
        />
      </section>

      {!costComplete && (
        <section className="analytics-cost-warning" role="status">
          <div>
            <strong>Il margine non è ancora completo.</strong>
            <p>
              I costi sono disponibili per il {metrics.cost_coverage}% delle unità
              vendute nel periodo. Lo storico senza costo non viene stimato con valori
              attuali.
            </p>
          </div>
          <Link className="button button-secondary" href="/admin/statistiche/costi">
            Completa i costi
          </Link>
        </section>
      )}

      <section className="analytics-grid analytics-grid-primary">
        <article className="analytics-panel analytics-revenue-panel">
          <div className="analytics-panel-heading">
            <div>
              <p className="eyebrow">Andamento</p>
              <h2>Incasso per giorno</h2>
            </div>
            <strong>{formatCurrency(metrics.revenue)}</strong>
          </div>
          <RevenueChart entries={analytics.daily} />
        </article>

        <article className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p className="eyebrow">Canali</p>
              <h2>Sala e asporto</h2>
            </div>
          </div>
          <RevenueSplit
            dineIn={metrics.dine_in_revenue}
            takeaway={metrics.takeaway_revenue}
          />
        </article>
      </section>

      <section className="analytics-grid analytics-ranking-grid">
        <article className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p className="eyebrow">Pizzeria</p>
              <h2>Pizze più ordinate</h2>
            </div>
          </div>
          <ProductRanking entries={analytics.top_pizzas} empty="Nessuna pizza venduta nel periodo." />
        </article>
        <article className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <p className="eyebrow">Tutto il menu</p>
              <h2>Prodotti più ordinati</h2>
            </div>
          </div>
          <ProductRanking entries={analytics.top_products} empty="Nessun prodotto venduto nel periodo." />
        </article>
      </section>

      <section className="analytics-panel analytics-services-panel">
        <div className="analytics-panel-heading">
          <div>
            <p className="eyebrow">Confronto</p>
            <h2>Come sono andati i servizi</h2>
          </div>
          <span>{analytics.services.length} risultati</span>
        </div>
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Servizio</th>
                <th>Durata</th>
                <th>Ordini</th>
                <th>Coperti</th>
                <th>Media</th>
                <th>Incasso</th>
                <th>Margine</th>
              </tr>
            </thead>
            <tbody>
              {analytics.services.map((service) => (
                <ServiceRow service={service} key={service.id} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <article className={`analytics-kpi ${warning ? "is-warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PresetLink({
  days,
  label,
  period,
  today,
}: {
  days: number;
  label: string;
  period: AnalyticsRange["period"];
  today: string;
}) {
  return (
    <Link
      className="analytics-preset"
      href={analyticsHref(shiftIsoDate(today, -(days - 1)), today, period)}
    >
      {label}
    </Link>
  );
}

function RevenueChart({ entries }: { entries: AnalyticsDailyEntry[] }) {
  if (!entries.length) return <p className="analytics-empty-copy">Nessun incasso nel periodo.</p>;
  const width = 720;
  const height = 230;
  const left = 22;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...entries.map((entry) => entry.revenue), 1);
  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? left + plotWidth / 2
      : left + (index / (entries.length - 1)) * plotWidth;
    const y = top + plotHeight - (entry.revenue / max) * plotHeight;
    return { x, y, entry };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`;
  const labelIndexes = [...new Set([0, Math.floor((entries.length - 1) / 2), entries.length - 1])];

  return (
    <svg
      className="analytics-revenue-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Incasso giornaliero: massimo ${formatCurrency(max)}`}
    >
      <title>Incasso giornaliero</title>
      {[0, 0.5, 1].map((ratio) => {
        const y = top + plotHeight - ratio * plotHeight;
        return <line className="analytics-chart-grid" x1={left} x2={left + plotWidth} y1={y} y2={y} key={ratio} />;
      })}
      <polygon className="analytics-chart-area" points={area} />
      <polyline className="analytics-chart-line" points={line} />
      {points.map((point) => (
        <circle key={point.entry.date} className="analytics-chart-point" cx={point.x} cy={point.y} r="4">
          <title>{`${formatDate(point.entry.date)}: ${formatCurrency(point.entry.revenue)}, ${point.entry.order_count} ordini`}</title>
        </circle>
      ))}
      {labelIndexes.map((index) => {
        const point = points[index];
        return (
          <text
            className="analytics-chart-label"
            x={point.x}
            y={height - 12}
            textAnchor={index === 0 ? "start" : index === entries.length - 1 ? "end" : "middle"}
            key={point.entry.date}
          >
            {shortDate(point.entry.date)}
          </text>
        );
      })}
    </svg>
  );
}

function RevenueSplit({ dineIn, takeaway }: { dineIn: number; takeaway: number }) {
  const total = dineIn + takeaway;
  const dineInShare = total ? Math.round((dineIn / total) * 100) : 0;
  const takeawayShare = total ? 100 - dineInShare : 0;
  return (
    <div className="analytics-split">
      <div className="analytics-split-bar" aria-label={`Sala ${dineInShare}%, asporto ${takeawayShare}%`}>
        <span className="is-dine-in" style={{ width: `${dineInShare}%` }} />
        <span className="is-takeaway" style={{ width: `${takeawayShare}%` }} />
      </div>
      <dl>
        <div>
          <dt><span className="analytics-dot is-dine-in" /> Sala</dt>
          <dd><strong>{formatCurrency(dineIn)}</strong><small>{dineInShare}%</small></dd>
        </div>
        <div>
          <dt><span className="analytics-dot is-takeaway" /> Asporto</dt>
          <dd><strong>{formatCurrency(takeaway)}</strong><small>{takeawayShare}%</small></dd>
        </div>
      </dl>
    </div>
  );
}

function ProductRanking({ entries, empty }: { entries: AnalyticsProductEntry[]; empty: string }) {
  if (!entries.length) return <p className="analytics-empty-copy">{empty}</p>;
  const max = Math.max(...entries.map((entry) => entry.quantity), 1);
  return (
    <ol className="analytics-ranking">
      {entries.map((entry, index) => (
        <li key={entry.name}>
          <span className="analytics-rank-number">{index + 1}</span>
          <div>
            <div className="analytics-rank-label">
              <strong>{entry.name}</strong>
              <span>{entry.quantity} · {formatCurrency(entry.revenue)}</span>
            </div>
            <span className="analytics-rank-track" aria-hidden="true">
              <span style={{ "--rank-width": `${(entry.quantity / max) * 100}%` } as CSSProperties} />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ServiceRow({ service }: { service: AnalyticsServiceEntry }) {
  return (
    <tr>
      <td>
        <strong>{formatDate(service.business_date)} · {periodLabel(service.period)}</strong>
        <small>
          {service.closed_at ? `${formatTime(service.opened_at)}–${formatTime(service.closed_at)}` : "In corso"}
          {service.forced_close ? " · chiusura forzata" : ""}
        </small>
      </td>
      <td>{formatDuration(service.duration_minutes)}</td>
      <td>{service.order_count}<small>{service.cancelled_count ? `${service.cancelled_count} annullati` : "Nessun annullato"}</small></td>
      <td>{service.cover_count}</td>
      <td>{formatCurrency(service.average_order)}</td>
      <td><strong>{formatCurrency(service.revenue)}</strong></td>
      <td>
        {service.gross_profit === null ? <span className="analytics-incomplete">{service.cost_coverage}% costi</span> : <strong>{formatCurrency(service.gross_profit)}</strong>}
      </td>
    </tr>
  );
}

function analyticsHref(from: string, to: string, period: AnalyticsRange["period"]) {
  const query = new URLSearchParams({ from, to });
  if (period) query.set("period", period);
  return `/admin/statistiche?${query.toString()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours ? `${hours}h ${remainder.toString().padStart(2, "0")}m` : `${remainder} min`;
}

function periodLabel(period: ServicePeriod) {
  if (period === "pranzo") return "Pranzo";
  if (period === "cena") return "Cena";
  return "Recupero";
}
