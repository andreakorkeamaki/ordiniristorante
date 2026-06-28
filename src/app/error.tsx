"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="center-page">
      <section className="empty-card">
        <span className="eyebrow">Errore</span>
        <h1>Qualcosa non ha funzionato</h1>
        <p>Controlla la connessione e riprova.</p>
        <button className="button button-primary" onClick={reset}>
          Riprova
        </button>
      </section>
    </main>
  );
}
