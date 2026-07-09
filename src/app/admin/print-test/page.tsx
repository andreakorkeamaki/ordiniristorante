import type { Metadata } from "next";
import { BrowserTestPrint } from "@/components/browser-test-print";
import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";
import type { OrderTicketPrintMode } from "@/types/domain";

export const metadata: Metadata = { title: "Prova stampa browser" };
export const dynamic = "force-dynamic";

export default async function AdminPrintTestPage({
  searchParams,
}: {
  searchParams: Promise<{ autoprint?: string; mode?: string }>;
}) {
  const profile = await requireProfile(["admin"]);
  const params = await searchParams;
  const mode = normalizePrintMode(params.mode);

  return (
    <>
      <AppHeader profile={profile} />
      <BrowserTestPrint autoPrint={params.autoprint === "1"} mode={mode} />
    </>
  );
}

function normalizePrintMode(value: string | undefined): OrderTicketPrintMode {
  return value === "legacy_three_copies"
    ? "legacy_three_copies"
    : "department_split";
}
