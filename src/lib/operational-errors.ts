export type OperationalErrorCode =
  | "browser_offline"
  | "backend_unreachable"
  | "supabase_unreachable"
  | "printnode_unreachable"
  | "printnode_timeout"
  | "printnode_not_configured"
  | "computer_disconnected"
  | "printer_offline"
  | "accepted_db_unconfirmed"
  | "printnode_job_error"
  | "printnode_job_expired"
  | "outcome_uncertain"
  | "conflict"
  | "invalid_state";

const STAFF_GUIDANCE: Record<
  OperationalErrorCode,
  { message: string; action: string }
> = {
  browser_offline: {
    message: "Questo dispositivo è offline.",
    action: "Ripristina la rete prima di eseguire altre operazioni.",
  },
  backend_unreachable: {
    message: "Il server dell’app non è raggiungibile.",
    action: "Attendi il ripristino e usa Aggiorna. Non ripetere una stampa incerta.",
  },
  supabase_unreachable: {
    message: "I dati operativi non sono raggiungibili.",
    action: "Conserva la schermata aperta e riprova. Le modifiche restano bloccate.",
  },
  printnode_unreachable: {
    message: "PrintNode non è raggiungibile.",
    action: "Verifica Internet; per lo scontrino usa la stampa browser e conferma manualmente.",
  },
  printnode_timeout: {
    message: "PrintNode non ha risposto in tempo.",
    action: "Non ristampare: verifica prima se il foglio è uscito.",
  },
  printnode_not_configured: {
    message: "PrintNode non è configurato sul server.",
    action: "Usa il fallback browser e segnala la configurazione mancante.",
  },
  computer_disconnected: {
    message: "Il computer Dell di stampa è disconnesso.",
    action: "Avvia o riconnetti il client PrintNode sul Dell.",
  },
  printer_offline: {
    message: "La stampante è offline.",
    action: "Controlla alimentazione, carta e collegamento al Dell.",
  },
  accepted_db_unconfirmed: {
    message: "PrintNode ha accettato il job, ma il salvataggio locale non è confermato.",
    action: "Non ristampare. Verifica il foglio e poi aggiorna lo stato.",
  },
  printnode_job_error: {
    message: "PrintNode ha segnalato un errore del job.",
    action: "Controlla stampante e dettagli del job prima di creare un retry.",
  },
  printnode_job_expired: {
    message: "Il job è scaduto prima di raggiungere il computer di stampa.",
    action: "Ripristina il Dell, poi crea un retry tracciato.",
  },
  outcome_uncertain: {
    message: "L’esito della stampa non è certo.",
    action: "Non inviare automaticamente un duplicato: verifica il foglio o conferma il fallback.",
  },
  conflict: {
    message: "I dati sono cambiati durante l’operazione.",
    action: "Aggiorna la schermata e verifica lo stato reale prima di continuare.",
  },
  invalid_state: {
    message: "L’operazione non è consentita nello stato attuale.",
    action: "Aggiorna la schermata e completa prima le attività indicate.",
  },
};

export function operationalError(code: OperationalErrorCode) {
  return { code, ...STAFF_GUIDANCE[code] };
}

