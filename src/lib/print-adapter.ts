import type { Order } from "@/types/domain";

export type PrintResult =
  | { status: "not_configured"; message: string }
  | { status: "sent"; externalId: string }
  | { status: "failed"; message: string };

export interface PrintAdapter {
  printOrder(order: Order): Promise<PrintResult>;
}

export const unconfiguredPrintAdapter: PrintAdapter = {
  async printOrder() {
    return {
      status: "not_configured",
      message: "In attesa di configurazione stampante",
    };
  },
};
