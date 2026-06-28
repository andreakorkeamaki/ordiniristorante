import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Amministrazione" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await requireProfile(["admin"]);
  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace admin-workspace">
        <AdminDashboard />
      </main>
    </>
  );
}
