"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ConnectionStatus =
  | "checking"
  | "online"
  | "offline"
  | "backend-unreachable";

interface ConnectionContextValue {
  status: ConnectionStatus;
  canWrite: boolean;
  blockReason: string | null;
  markUnreliable: () => void;
  verify: () => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

function isOperationalPath(pathname: string) {
  return (
    pathname === "/staff/tables" ||
    pathname.startsWith("/staff/table/") ||
    pathname === "/cassa" ||
    pathname === "/admin"
  );
}

function getBlockReason(status: ConnectionStatus) {
  if (status === "checking") {
    return "Verifica della connessione in corso. Attendi prima di modificare la comanda.";
  }
  if (status === "offline") {
    return "Connessione assente. Le modifiche non verranno salvate finché non torna la rete.";
  }
  if (status === "backend-unreachable") {
    return "Connessione non affidabile. Il server non è raggiungibile e le modifiche sono bloccate.";
  }
  return null;
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const operational = isOperationalPath(pathname);
  const [status, setStatus] = useState<ConnectionStatus>(
    operational ? "checking" : "online",
  );

  const verify = useCallback(async () => {
    if (!operational) {
      setStatus("online");
      return true;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      return false;
    }

    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error("Backend non raggiungibile");
      setStatus("online");
      return true;
    } catch {
      setStatus(navigator.onLine ? "backend-unreachable" : "offline");
      return false;
    }
  }, [operational]);
  const markUnreliable = useCallback(() => {
    setStatus("backend-unreachable");
  }, []);

  useEffect(() => {
    if (!operational) {
      return;
    }

    const offline = () => setStatus("offline");
    const online = () => void verify();

    queueMicrotask(() => void verify());
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    const interval = window.setInterval(() => void verify(), 15_000);

    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.clearInterval(interval);
    };
  }, [operational, verify]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      status,
      canWrite: !operational || status === "online",
      blockReason: operational ? getBlockReason(status) : null,
      markUnreliable,
      verify,
    }),
    [markUnreliable, operational, status, verify],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const value = useContext(ConnectionContext);
  if (!value) {
    throw new Error("useConnection deve essere usato dentro ConnectionProvider");
  }
  return value;
}
