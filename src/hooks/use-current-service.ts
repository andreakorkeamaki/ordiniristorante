"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { readFailureState, type ReliableDataState } from "@/lib/reliable-data-state";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantService } from "@/types/domain";

export function useCurrentService() {
  const { markUnreliable } = useConnection();
  const [service, setService] = useState<RestaurantService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadGeneration = useRef(0);
  const hasSnapshot = useRef(false);
  const [state, setState] = useState<ReliableDataState>("loading");

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const { data, error: serviceError } = await createClient()
      .from("restaurant_services")
      .select("*")
      .is("closed_at", null)
      .maybeSingle();

    if (serviceError) {
      if (generation !== loadGeneration.current) return;
      if (!serviceError.code) markUnreliable();
      setError(serviceError.message);
      setState(readFailureState(hasSnapshot.current));
      setLoading(false);
      return;
    }

    if (generation !== loadGeneration.current) return;
    setService(data as RestaurantService | null);
    hasSnapshot.current = true;
    setError("");
    setState("ready");
    setLoading(false);
  }, [markUnreliable]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const supabase = createClient();
    const channel = supabase
      .channel("current-restaurant-service")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_services" },
        load,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return { service, loading, error, state, reload: load };
}
