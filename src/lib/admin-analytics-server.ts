import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeAdminAnalytics,
  normalizeCostCatalog,
  type AdminAnalytics,
  type AnalyticsRange,
  type CostCatalog,
} from "@/lib/admin-analytics";

export async function loadAdminAnalytics(
  range: AnalyticsRange,
): Promise<{ data: AdminAnalytics | null; error: string | null }> {
  try {
    const { data, error } = await createAdminClient().rpc("get_admin_analytics", {
      p_from: range.from,
      p_to: range.to,
      p_order_type: range.orderType,
      p_period: range.period,
    });
    if (error) {
      return {
        data: null,
        error: "Statistiche non disponibili. Verifica configurazione e migration.",
      };
    }
    return { data: normalizeAdminAnalytics(data), error: null };
  } catch {
    return {
      data: null,
      error: "Statistiche non disponibili. Verifica configurazione e migration.",
    };
  }
}

export async function loadLunchServiceEnabled() {
  try {
    const { data, error } = await createAdminClient()
      .from("restaurant_settings")
      .select("lunch_service_enabled")
      .single();
    return !error && data?.lunch_service_enabled === true;
  } catch {
    return false;
  }
}

export async function loadCostCatalog(): Promise<{
  data: CostCatalog | null;
  error: string | null;
}> {
  try {
    const { data, error } = await createAdminClient().rpc("get_admin_cost_catalog");
    if (error) {
      return {
        data: null,
        error: "Costi prodotto non disponibili. Verifica configurazione e migration.",
      };
    }
    return { data: normalizeCostCatalog(data), error: null };
  } catch {
    return {
      data: null,
      error: "Costi prodotto non disponibili. Verifica configurazione e migration.",
    };
  }
}
