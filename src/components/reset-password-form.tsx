"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

type Status =
  | "checking"
  | "ready"
  | "saving"
  | "saved"
  | "invalid"
  | "error"
  | "misconfigured";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!hasSupabaseEnv()) {
        if (active) setStatus("misconfigured");
        return;
      }
      try {
        const supabase = createClient();
        const params = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          window.history.replaceState(null, "", window.location.pathname);
          if (error) {
            if (active) setStatus("invalid");
            return;
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (active) setStatus(user ? "ready" : "invalid");
      } catch {
        if (active) setStatus("misconfigured");
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");

    if (password.length < 8 || password !== confirmation) {
      setStatus("error");
      return;
    }

    setStatus("saving");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("error");
        return;
      }

      await supabase.auth.signOut();
      form.reset();
      setStatus("saved");
    } catch {
      setStatus("misconfigured");
    }
  }

  if (status === "misconfigured") {
    return (
      <section className="login-card" role="alert">
        <div>
          <span className="eyebrow">Area riservata</span>
          <h2>Servizio non configurato</h2>
        </div>
        <p className="form-error">
          Il recupero password non è disponibile per un errore di configurazione
          del deploy. Contatta il responsabile tecnico.
        </p>
      </section>
    );
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div>
        <span className="eyebrow">Area riservata</span>
        <h2>Nuova password</h2>
      </div>

      {status === "checking" && <p>Verifica del link in corso…</p>}
      {status === "invalid" && (
        <>
          <p className="form-error">Link non valido o scaduto. Richiedi una nuova email.</p>
          <a className="button button-primary" href="/staff/forgot-password">Richiedi un nuovo link</a>
        </>
      )}
      {status === "saved" && (
        <>
          <p className="form-success">Password aggiornata. Ora puoi accedere.</p>
          <a className="button button-primary" href="/staff">Vai al login</a>
        </>
      )}
      {status !== "invalid" && status !== "saved" && status !== "checking" && (
        <>
          {status === "error" && (
            <p className="form-error">Le password devono coincidere e contenere almeno 8 caratteri.</p>
          )}
          <label>
            Nuova password
            <input name="password" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <label>
            Conferma password
            <input name="confirmation" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <button className="button button-primary button-large" type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Salvataggio…" : "Salva nuova password"}
          </button>
        </>
      )}
    </form>
  );
}
