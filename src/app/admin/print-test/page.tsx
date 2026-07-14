import type { Metadata } from "next";
import { BrowserTestPrint } from "@/components/browser-test-print";
import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";
import { decodeEscPosPreview } from "@/lib/esc-pos-preview";
import {
  buildRaw80mmDepartmentTicket,
  buildRaw80mmTicket,
} from "@/lib/print-ticket-raw";
import { buildSamplePrintOrder } from "@/lib/print-test-order";
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
  const order = buildSamplePrintOrder();
  const rawTicket = mode === "department_split"
    ? buildRaw80mmDepartmentTicket(order, "new_order")
    : buildRaw80mmTicket(order, "new_order");
  const tickets = decodeEscPosPreview(
    rawTicket,
    mode === "department_split" ? 1 : 3,
  );

  return (
    <>
      <AppHeader profile={profile} />
      <BrowserTestPrint autoPrint={params.autoprint === "1"} tickets={tickets} />
    </>
  );
}

function normalizePrintMode(value: string | undefined): OrderTicketPrintMode {
  return value === "legacy_three_copies"
    ? "legacy_three_copies"
    : "department_split";
}
