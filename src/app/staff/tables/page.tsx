import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { StaffTables } from "@/components/staff-tables";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Tavoli" };
export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const profile = await requireProfile(["waiter", "cashier", "admin"]);
  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace">
        <StaffTables />
      </main>
    </>
  );
}
