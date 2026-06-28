import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { login } from "@/app/staff/actions";
import { SetupNotice } from "@/components/setup-notice";
import { getCurrentProfile } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Accesso staff" };

const messages: Record<string, string> = {
  credentials: "Email o password non corretti.",
  inactive: "Account non attivo. Chiedi all’amministratore di abilitarlo.",
  config: "Supabase non è ancora configurato.",
};

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  if (profile?.active) redirect(profile.role === "waiter" ? "/staff/tables" : "/cassa");

  return (
    <main className="login-page">
      <section className="login-brand">
        <span className="brand-mark brand-mark-large">LS</span>
        <p className="eyebrow">La Sagretta</p>
        <h1>Comande condivise,<br />senza riscriverle.</h1>
        <p>Accedi dal tuo telefono. La cassa riceverà ogni comanda in tempo reale.</p>
      </section>
      {hasSupabaseEnv() ? (
        <form className="login-card" action={login}>
          <div>
            <span className="eyebrow">Area riservata</span>
            <h2>Accedi</h2>
          </div>
          {params.error && <p className="form-error">{messages[params.error] ?? "Accesso non riuscito."}</p>}
          <input type="hidden" name="next" value={params.next ?? ""} />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button button-primary button-large" type="submit">
            Entra
          </button>
          <div className="login-links">
            <a className="text-link" href="/staff/forgot-password">Password dimenticata?</a>
            <LinkToMenu />
          </div>
        </form>
      ) : (
        <SetupNotice />
      )}
    </main>
  );
}

function LinkToMenu() {
  return <a className="text-link" href="/menu">Apri il menu pubblico</a>;
}
