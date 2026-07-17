import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { AdminAnalyticsDashboard } from "@/components/admin-analytics-dashboard";
import { resolveAnalyticsRange } from "@/lib/admin-analytics";
import {
  loadAdminAnalytics,
  loadLunchServiceEnabled,
} from "@/lib/admin-analytics-server";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Statistiche" };
export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    order_type?: string;
  }>;
}) {
  const profile = await requireProfile(["admin"]);
  const requestedRange = resolveAnalyticsRange(await searchParams);
  const lunchEnabled = await loadLunchServiceEnabled();
  const range =
    !lunchEnabled && requestedRange.period === "pranzo"
      ? { ...requestedRange, period: null }
      : requestedRange;
  const result = await loadAdminAnalytics(range);

  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace analytics-workspace">
        <AdminAnalyticsDashboard
          analytics={result.data}
          error={result.error}
          lunchEnabled={lunchEnabled}
          range={range}
        />
      </main>
    </>
  );
}
