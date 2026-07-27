import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";
import {
  loadMenuTranslationHistory,
  type MenuTranslationChange,
  type MenuTranslationRun,
} from "@/lib/menu-translation-history";

export const metadata: Metadata = { title: "Traduzioni automatiche" };
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const entityLabels = {
  category: "Categoria",
  item: "Prodotto",
  extra: "Extra",
  settings: "Impostazioni",
} as const;

const fieldLabels: Record<string, string> = {
  name_en: "Nome",
  description_en: "Descrizione",
  ingredients_en: "Ingredienti",
  allergen_notice_en: "Avviso allergeni",
};

export default async function AdminTranslationsPage() {
  const profile = await requireProfile(["admin"]);
  const history = await loadMenuTranslationHistory();
  const todayKey = dayKeyFormatter.format(new Date());
  const todayRuns = history.runs.filter(
    (run) => dayKeyFormatter.format(new Date(run.startedAt)) === todayKey,
  );
  const lastRun = history.runs[0] ?? null;
  const todayUpdated = todayRuns.reduce(
    (total, run) => total + run.updatedFields,
    0,
  );
  const todayTokens = todayRuns.reduce(
    (total, run) => total + (run.totalTokens ?? 0),
    0,
  );
  const todayFailures = todayRuns.filter(
    ({ status }) => status === "failed",
  ).length;

  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace admin-workspace translation-workspace">
        <section className="workspace-heading translation-heading">
          <div>
            <p className="eyebrow">Controllo automatico</p>
            <h1>Traduzioni</h1>
            <p>
              Storico delle traduzioni inglesi generate per il menu.
            </p>
          </div>
          <div className="translation-schedule">
            <span>Prossimo controllo</span>
            <strong>Ogni giorno · 02:15 UTC</strong>
          </div>
        </section>

        <nav className="admin-tabs" aria-label="Navigazione amministrazione">
          <Link href="/admin">Amministrazione</Link>
          <span className="active" aria-current="page">
            Traduzioni
          </span>
        </nav>

        {history.error && (
          <section className="connection-action-hint" role="alert">
            <strong>Storico non disponibile.</strong> {history.error}
          </section>
        )}

        <section className="translation-metrics" aria-label="Riepilogo di oggi">
          <Metric
            eyebrow="Oggi"
            value={String(todayRuns.length)}
            label={todayRuns.length === 1 ? "esecuzione" : "esecuzioni"}
          />
          <Metric
            eyebrow="Traduzioni"
            value={String(todayUpdated)}
            label="campi aggiornati"
          />
          <Metric
            eyebrow="Consumo"
            value={todayTokens.toLocaleString("it-IT")}
            label="token OpenAI"
          />
          <Metric
            eyebrow="Errori"
            value={String(todayFailures)}
            label={todayFailures === 1 ? "esecuzione fallita" : "esecuzioni fallite"}
            danger={todayFailures > 0}
          />
        </section>

        <section className="translation-latest admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Stato</p>
              <h2>Ultimo controllo</h2>
            </div>
            {lastRun && <RunStatus status={lastRun.status} />}
          </div>
          {lastRun ? (
            <div className="translation-latest-body">
              <div>
                <span>Eseguito</span>
                <strong>{formatDate(lastRun.startedAt)}</strong>
              </div>
              <div>
                <span>Aggiornati</span>
                <strong>{lastRun.updatedFields}</strong>
              </div>
              <div>
                <span>Ancora mancanti</span>
                <strong>{lastRun.remainingFields}</strong>
              </div>
              <div>
                <span>Token</span>
                <strong>{lastRun.totalTokens?.toLocaleString("it-IT") ?? "—"}</strong>
              </div>
              {lastRun.errorMessage && (
                <p className="translation-run-error" role="alert">
                  {lastRun.errorMessage}
                </p>
              )}
            </div>
          ) : (
            <p className="translation-empty">
              Nessuna esecuzione registrata. Lo storico comparirà dopo il primo
              controllo in produzione.
            </p>
          )}
        </section>

        <section className="translation-history">
          <div className="translation-section-heading">
            <div>
              <p className="eyebrow">Registro</p>
              <h2>Esecuzioni recenti</h2>
            </div>
            <span>Ultime {history.runs.length}</span>
          </div>

          {history.runs.length === 0 ? (
            <div className="admin-panel translation-empty">
              Le traduzioni effettuate verranno mostrate qui.
            </div>
          ) : (
            <div className="translation-run-list">
              {history.runs.map((run, index) => (
                <TranslationRunCard
                  key={run.id}
                  run={run}
                  initiallyOpen={index === 0}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Metric({
  eyebrow,
  value,
  label,
  danger = false,
}: {
  eyebrow: string;
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <article className={`translation-metric${danger ? " is-danger" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function RunStatus({ status }: { status: MenuTranslationRun["status"] }) {
  const label =
    status === "succeeded"
      ? "Completato"
      : status === "failed"
        ? "Errore"
        : "In corso";
  return (
    <span className={`translation-status is-${status}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function TranslationRunCard({
  run,
  initiallyOpen,
}: {
  run: MenuTranslationRun;
  initiallyOpen: boolean;
}) {
  return (
    <details className="translation-run admin-panel" open={initiallyOpen}>
      <summary>
        <div>
          <RunStatus status={run.status} />
          <strong>{formatDate(run.startedAt)}</strong>
        </div>
        <div className="translation-run-summary">
          <span>
            <b>{run.updatedFields}</b> aggiornati
          </span>
          <span>
            <b>{run.remainingFields}</b> mancanti
          </span>
          <span>
            <b>{run.totalTokens?.toLocaleString("it-IT") ?? "—"}</b> token
          </span>
        </div>
      </summary>

      <div className="translation-run-body">
        <div className="translation-run-meta">
          <span>Modello: {run.model ?? "nessuna chiamata OpenAI"}</span>
          <span>Trovati: {run.foundFields}</span>
          <span>Saltati: {run.skippedFields}</span>
          <span>
            Record: {run.translatedCategories} categorie · {run.translatedItems} prodotti
            {" · "}
            {run.translatedExtras} extra · {run.translatedSettings} impostazioni
          </span>
        </div>

        {run.errorMessage && (
          <p className="translation-run-error" role="alert">
            {run.errorMessage}
          </p>
        )}

        {run.changes.length > 0 ? (
          <div className="translation-change-list">
            {run.changes.map((change) => (
              <TranslationChangeRow key={change.id} change={change} />
            ))}
          </div>
        ) : (
          <p className="translation-empty compact">
            Nessuna traduzione necessaria in questa esecuzione.
          </p>
        )}
      </div>
    </details>
  );
}

function TranslationChangeRow({
  change,
}: {
  change: MenuTranslationChange;
}) {
  return (
    <article className="translation-change">
      <div className="translation-change-label">
        <span>{entityLabels[change.entity]}</span>
        <strong>{fieldLabels[change.targetField] ?? change.targetField}</strong>
      </div>
      <div>
        <small>Italiano</small>
        <p lang="it">{change.italianText}</p>
      </div>
      <span className="translation-arrow" aria-hidden="true">
        →
      </span>
      <div>
        <small>English</small>
        <p lang="en">{change.englishText}</p>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
