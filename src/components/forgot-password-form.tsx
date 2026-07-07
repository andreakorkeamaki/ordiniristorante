"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error" | "misconfigured"
  >(hasSupabaseEnv() ? "idle" : "misconfigured");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    try {
      const data = new FormData(event.currentTarget);
      const email = String(data.get("email") ?? "").trim();
      const redirectTo = `${window.location.origin}/auth/callback?next=/staff/reset-password`;
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("misconfigured");
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div>
        <span className="eyebrow">Recupero account</span>
        <h2>Reimposta la password</h2>
      </div>
      <p>Inserisci l’email dello staff. Riceverai un link valido per scegliere una nuova password.</p>
      {status === "sent" && (
        <p className="form-success">Email inviata. Controlla anche la cartella spam.</p>
      )}
      {status === "error" && (
        <p className="form-error">Invio non riuscito. Attendi qualche minuto e riprova.</p>
      )}
      {status === "misconfigured" && (
        <p className="form-error">
          Recupero password non configurato nel deploy. Contatta il responsabile tecnico.
        </p>
      )}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <button
        className="button button-primary button-large"
        type="submit"
        disabled={status === "sending" || status === "misconfigured"}
      >
        {status === "sending" ? "Invio…" : "Invia link di recupero"}
      </button>
      <a className="text-link" href="/staff">Torna al login</a>
    </form>
  );
}
