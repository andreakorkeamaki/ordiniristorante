"use client";

import { useConnection } from "@/components/connection-provider";

export function OfflineBanner() {
  const { blockReason } = useConnection();
  if (!blockReason) return null;

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <strong>{blockReason}</strong>
      <span>I dati visibili potrebbero non essere aggiornati. Non chiudere o ricaricare questa pagina.</span>
    </div>
  );
}
