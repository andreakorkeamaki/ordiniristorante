import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TakeawayDashboard } from "@/components/takeaway-dashboard";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Asporti" };
export const dynamic = "force-dynamic";

export default async function TakeawayPage() {
  const profile = await requireProfile(["cashier", "admin"]);

  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace">
        <TakeawayDashboard />
      </main>
    </>
  );
}
