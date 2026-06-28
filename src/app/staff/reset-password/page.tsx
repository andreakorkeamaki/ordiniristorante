import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = { title: "Nuova password" };

export default function ResetPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-brand">
        <span className="brand-mark brand-mark-large">LS</span>
        <p className="eyebrow">La Sagretta</p>
        <h1>Scegli una nuova<br />password.</h1>
        <p>Al termine tornerai al login dell’area staff.</p>
      </section>
      <ResetPasswordForm />
    </main>
  );
}
