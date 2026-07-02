"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantService } from "@/types/domain";

export function useCurrentService() {
  const { markUnreliable } = useConnection();
  const [service, setService] = useState<RestaurantService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: serviceError } = await createClient()
      .from("restaurant_services")
      .select("*")
      .is("closed_at", null)
      .maybeSingle();

    if (serviceError) {
      if (!serviceError.code) markUnreliable();
      setError(serviceError.message);
      setLoading(false);
      return;
    }

    setService(data as RestaurantService | null);
    setError("");
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

  return { service, loading, error, reload: load };
}
