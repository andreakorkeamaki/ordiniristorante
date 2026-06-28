export function SetupNotice() {
  return (
    <section className="empty-card">
      <span className="eyebrow">Configurazione richiesta</span>
      <h1>Collega Supabase</h1>
      <p>
        Crea <code>.env.local</code> partendo da <code>.env.example</code> e inserisci la
        publishable key del progetto.
      </p>
    </section>
  );
}
