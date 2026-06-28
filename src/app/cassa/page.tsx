import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { CashierDashboard } from "@/components/cashier-dashboard";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Cassa" };
export const dynamic = "force-dynamic";

export default async function CashierPage() {
  const profile = await requireProfile(["cashier", "admin"]);
  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace cashier-workspace">
        <CashierDashboard />
      </main>
    </>
  );
}
