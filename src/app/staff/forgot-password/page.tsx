import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Recupera password" };

export default function ForgotPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-brand">
        <span className="brand-mark brand-mark-large">LS</span>
        <p className="eyebrow">La Sagretta</p>
        <h1>Recupera l’accesso<br />in sicurezza.</h1>
        <p>Il link ricevuto via email permette di scegliere una nuova password.</p>
      </section>
      <ForgotPasswordForm />
    </main>
  );
}
