import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { TableOrder } from "@/components/table-order";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Comanda asporto" };
export const dynamic = "force-dynamic";

export default async function TakeawayOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, profile] = await Promise.all([
    params,
    requireProfile(["waiter", "cashier", "admin"]),
  ]);

  return (
    <>
      <AppHeader profile={profile} />
      <main className="workspace order-workspace">
        <TableOrder orderId={id} profile={profile} />
      </main>
    </>
  );
}
